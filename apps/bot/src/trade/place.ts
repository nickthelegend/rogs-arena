import {
  isBinaryMarket,
  ORDER_TYPE,
  quoteBinarySellOverBook,
  quoteBinaryStakeOverBook,
  type BinaryBookParams,
  type BinaryBuySide,
  type BinaryOrderBook,
  type BinarySellQuote,
  type BinarySellSide,
  type BinaryStakeQuote,
  type MarketOnchain,
  type PlaceOrderResult,
  type SomniaMarkets,
  type UnifiedMarket,
} from '@somnia-chain/markets-sdk'
import { formatEther, formatUnits, parseUnits, type Hex } from 'viem'
import { publicClient, tusdcAbi, tusdcAddress, writeGasEnvelope } from '@/chain'
import { errorMessage } from '@/lib/async'
import type { BotWallet } from '@/wallets'
import type { MarketSnapshot } from './snapshot'
import type { BookPrices, CostBounds, TradeIntent, TradeResult, WalletPositions } from './types'
import { assertTradeCost, resolveCostBounds } from './types'

const maxRetrySlippageBps = BigInt(1500)

export function isImmediateOrCancelNoFill(error: unknown) {
  return errorMessage(error).includes('ImmediateOrCancelNoFill')
}

export function widenedRetrySlippageBps(baseSlippageBps: bigint) {
  if (baseSlippageBps >= maxRetrySlippageBps) return null

  const doubled = baseSlippageBps * BigInt(2)
  const bumped = baseSlippageBps + BigInt(300)
  const widened = doubled > bumped ? doubled : bumped
  return widened > maxRetrySlippageBps ? maxRetrySlippageBps : widened
}

function humanAmount(raw: bigint, decimals: number) {
  return Number(formatUnits(raw, decimals))
}

function bestCrossPrice(book: BinaryOrderBook, intent: TradeIntent) {
  if (intent.action === 'buy') {
    return intent.outcome === 'YES' ? book.yesAsks[0]?.price : book.noAsks[0]?.price
  }
  return intent.outcome === 'YES' ? book.yesBids[0]?.price : book.noBids[0]?.price
}

export function bookPrices(book: BinaryOrderBook, decimals: number): BookPrices {
  return {
    yesBid: book.yesBids[0] ? humanAmount(book.yesBids[0].price, decimals) : undefined,
    noBid: book.noBids[0] ? humanAmount(book.noBids[0].price, decimals) : undefined,
  }
}

export async function walletCollateral(address: `0x${string}`, decimals: number) {
  const raw = await publicClient.readContract({
    address: tusdcAddress,
    abi: tusdcAbi,
    functionName: 'balanceOf',
    args: [address],
  })
  return humanAmount(raw, decimals)
}

export async function walletPositions(
  exchange: SomniaMarkets,
  address: `0x${string}`,
  marketId: string,
  decimals: number,
): Promise<WalletPositions> {
  const [pnl, collateral] = await Promise.all([
    exchange.client.getBinaryPositionPnL(address, marketId).catch(() => null),
    walletCollateral(address, decimals),
  ])

  return {
    yes: pnl ? humanAmount(pnl.balanceYes, decimals) : 0,
    no: pnl ? humanAmount(pnl.balanceNo, decimals) : 0,
    collateral,
    unrealizedPnl: pnl ? humanAmount(pnl.unrealizedPnl, decimals) : undefined,
  }
}

function sellQuantity(intent: TradeIntent, positions: WalletPositions, book: BinaryOrderBook, decimals: number) {
  const bid = bestCrossPrice(book, intent)
  if (!bid || bid <= 0n) return null

  const held = intent.outcome === 'YES' ? positions.yes : positions.no
  const rawHeld = parseUnits(held.toFixed(decimals), decimals)
  const rawCost = parseUnits(intent.cost.toFixed(decimals), decimals)
  const one = 10n ** BigInt(decimals)
  const rawFromCost = (rawCost * one) / bid
  const quantity = rawFromCost < rawHeld ? rawFromCost : rawHeld
  if (quantity <= 0n) return null
  return quantity
}

export async function placeTrade(
  exchange: SomniaMarkets,
  wallet: BotWallet,
  market: UnifiedMarket,
  intent: TradeIntent,
  options: {
    dryRun?: boolean
    slippagePercent?: number
    cost?: Partial<CostBounds>
    snapshot?: MarketSnapshot
    positions?: WalletPositions
  } = {},
): Promise<TradeResult> {
  const costBounds = resolveCostBounds(options.cost)
  assertTradeCost(intent, costBounds)
  if (!isBinaryMarket(market.info)) {
    throw new Error(`Market ${market.symbol} is not a binary market`)
  }

  exchange.setSigner({ account: wallet.account })

  const marketId = market.info.marketId
  const onchain = options.snapshot?.onchain ?? (await exchange.client.getMarketOnchain(marketId as Hex))
  if (onchain.status !== 1) {
    throw new Error(`Market ${market.symbol} is not trading on-chain`)
  }

  const [bookParams, book, positions, stt] = await Promise.all([
    options.snapshot?.bookParams ?? exchange.client.getBinaryBookParams(onchain.pool),
    options.snapshot?.book ??
      exchange.client.getBinaryOrderBook(onchain.pool, { depth: 10, decimals: onchain.decimals }),
    options.positions ?? walletPositions(exchange, wallet.address, marketId, onchain.decimals),
    publicClient.getBalance({ address: wallet.address }),
  ])

  if (!options.dryRun && stt < writeGasEnvelope) {
    throw new Error(
      `Need at least ${formatEther(writeGasEnvelope)} STT for the SDK gas envelope, have ${formatEther(stt)}. Run bun run faucet.`,
    )
  }

  const slippagePercent = options.slippagePercent ?? 2
  const slippageBps = BigInt(Math.round(slippagePercent * 100))
  const retrySlippageBps = widenedRetrySlippageBps(slippageBps)
  const slippagePlan = retrySlippageBps ? [slippageBps, retrySlippageBps] : [slippageBps]
  const oneCollateral = 10n ** BigInt(onchain.decimals)

  let quote: BinaryStakeQuote | BinarySellQuote | null = null
  let order: PlaceOrderResult | null = null

  for (const [index, nextSlippageBps] of slippagePlan.entries()) {
    const liveBook =
      index === 0
        ? book
        : await exchange.client.getBinaryOrderBook(onchain.pool, { depth: 10, decimals: onchain.decimals })
    quote = quoteIntent(intent, liveBook, positions, bookParams, oneCollateral, onchain, nextSlippageBps)
    if (!quote) {
      throw new Error(`No fillable ${intent.side} liquidity for cost ${intent.cost.toFixed(2)}`)
    }

    if (options.dryRun) {
      return tradeResult(wallet, market, intent, onchain, quote, undefined, true)
    }

    try {
      order = await exchange.trader.placeOrder({
        pool: onchain.pool,
        side: quote.side,
        price: quote.yesPrice,
        quantity: quote.quantity,
        outcomeToken: onchain.outcomeToken,
        yesId: onchain.yesId,
        noId: onchain.noId,
        collateral: onchain.collateral,
        expireTimestampNs: onchain.expiry * BigInt(1_000_000_000),
        orderType: ORDER_TYPE.MARKET,
      })
      break
    } catch (error) {
      if (!isImmediateOrCancelNoFill(error) || index === slippagePlan.length - 1) {
        throw error
      }
    }
  }

  if (!quote) {
    throw new Error('Quote did not complete')
  }

  return tradeResult(wallet, market, intent, onchain, quote, order ?? undefined, false)
}

function quoteIntent(
  intent: TradeIntent,
  book: BinaryOrderBook,
  positions: WalletPositions,
  bookParams: BinaryBookParams,
  oneCollateral: bigint,
  onchain: MarketOnchain,
  slippageBps: bigint,
) {
  const params = { ...bookParams, slippageBps }

  if (intent.action === 'buy') {
    const stake = parseUnits(intent.cost.toFixed(onchain.decimals), onchain.decimals)
    return quoteBinaryStakeOverBook(book, intent.side as BinaryBuySide, stake, oneCollateral, params)
  }

  const quantity = sellQuantity(intent, positions, book, onchain.decimals)
  if (!quantity) return null
  return quoteBinarySellOverBook(book, intent.side as BinarySellSide, quantity, oneCollateral, params)
}

function tradeResult(
  wallet: BotWallet,
  market: UnifiedMarket,
  intent: TradeIntent,
  onchain: MarketOnchain,
  quote: BinaryStakeQuote | BinarySellQuote,
  order: PlaceOrderResult | undefined,
  dryRun: boolean,
): TradeResult {
  const filledRaw = order?.fills.reduce((total, fill) => total + fill.quantityFilled, BigInt(0)) ?? 0n

  return {
    wallet: wallet.address,
    marketId: isBinaryMarket(market.info) ? market.info.marketId : market.id,
    symbol: market.symbol,
    side: intent.side,
    cost: intent.cost,
    quantity: humanAmount(quote.quantity, onchain.decimals),
    price: humanAmount(quote.limitPrice, onchain.decimals),
    filled: humanAmount(filledRaw, onchain.decimals),
    txHash: order?.hash,
    dryRun,
    exit: intent.exit,
  }
}
