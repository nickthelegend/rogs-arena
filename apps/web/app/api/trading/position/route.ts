import { errorMessage } from '@/lib/error'
import privy, { authorizationContext } from '@/lib/privy'
import { createDreamDexExchange } from '@/lib/dreamdex'
import {
  getCachedBinaryBookParams,
  getCachedMarketOnchain,
  setCachedBinaryBookParams,
  setCachedMarketOnchain,
} from '@/lib/dreamdex'
import { requirePrivyEthereumWallet, TradingApiError } from '@/app/api/privy-auth'
import { createViemAccount } from '@privy-io/node/viem'
import {
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
} from '@somnia-chain/markets-sdk'
import { abilityCardById } from '@/lib/ability'
import { recordAbilityBuy, settleAbilityClose, settleResolvedAbilityPlays } from '@/services/ability-settle'
import { formatUnits, parseUnits, type Hex } from 'viem'
import { z } from 'zod'

export const runtime = 'nodejs'

const maxRetrySlippageBps = BigInt(1500)

const placePositionBodySchema = z.object({
  wallet_id: z.string().min(1),
  market_id: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  market_symbol: z.string().min(1).optional(),
  tradable: z.string().min(1).optional(),
  outcome: z.enum(['YES', 'NO']),
  side: z.enum(['buy', 'sell']).default('buy'),
  amount: z.coerce.number().positive(),
  slippage_percent: z.coerce.number().min(0).max(50).default(2),
  ability_id: z.coerce.number().int().positive().optional(),
})

function createPositionDebugTimer() {
  const id = Math.random().toString(36).slice(2, 10)
  const startedAt = Date.now()
  const steps: { step: number; label: string; durationMs: number; elapsedMs: number }[] = []
  let step = 0

  async function wait<T>(label: string, promise: Promise<T>) {
    const currentStep = ++step
    const stepStartedAt = Date.now()
    const elapsedMs = stepStartedAt - startedAt

    console.info(`[trade-position-api:${id}] #${currentStep} ${label} start`, {
      elapsedMs,
    })

    try {
      const value = await promise
      const durationMs = Date.now() - stepStartedAt
      const totalElapsedMs = Date.now() - startedAt

      steps.push({ step: currentStep, label, durationMs, elapsedMs: totalElapsedMs })
      console.info(`[trade-position-api:${id}] #${currentStep} ${label} done`, {
        durationMs,
        elapsedMs: totalElapsedMs,
      })

      return value
    } catch (error) {
      const durationMs = Date.now() - stepStartedAt
      const totalElapsedMs = Date.now() - startedAt

      console.error(`[trade-position-api:${id}] #${currentStep} ${label} failed`, {
        durationMs,
        elapsedMs: totalElapsedMs,
        error: errorMessage(error),
      })
      throw error
    }
  }

  function summary() {
    return {
      id,
      elapsedMs: Date.now() - startedAt,
      steps,
    }
  }

  return { wait, summary }
}

function isImmediateOrCancelNoFill(error: unknown) {
  return errorMessage(error).includes('ImmediateOrCancelNoFill')
}

function widenedRetrySlippageBps(baseSlippageBps: bigint) {
  if (baseSlippageBps >= maxRetrySlippageBps) return null

  const doubled = baseSlippageBps * BigInt(2)
  const bumped = baseSlippageBps + BigInt(300)
  const widened = doubled > bumped ? doubled : bumped

  return widened > maxRetrySlippageBps ? maxRetrySlippageBps : widened
}

function binarySideForPosition(outcome: 'YES' | 'NO', side: 'buy' | 'sell'): BinaryBuySide | BinarySellSide {
  if (side === 'buy') return outcome === 'YES' ? 'BUY_YES' : 'BUY_NO'

  return outcome === 'YES' ? 'SELL_YES' : 'SELL_NO'
}

function humanAmount(raw: bigint, decimals: number) {
  return Number(formatUnits(raw, decimals))
}

function counterpartTradable(tradable: string | undefined, marketSymbol: string | undefined, outcome: 'YES' | 'NO') {
  const other = outcome === 'YES' ? 'NO' : 'YES'
  if (tradable && /#(YES|NO)$/i.test(tradable)) return tradable.replace(/#(YES|NO)$/i, `#${other}`)
  if (marketSymbol) return `${marketSymbol}#${other}`
  return undefined
}

function outcomeTradableSymbols(
  marketSymbol: string | undefined,
  tradable: string | undefined,
  outcome: 'YES' | 'NO',
) {
  const matched = tradable || (marketSymbol ? `${marketSymbol}#${outcome}` : undefined)
  const other = counterpartTradable(matched, marketSymbol, outcome)
  return {
    yes: outcome === 'YES' ? matched : other,
    no: outcome === 'NO' ? matched : other,
  }
}

async function onchainOutcomeBalances({
  exchange,
  onchain,
  account,
  marketSymbol,
  tradable,
  outcome,
}: {
  exchange: ReturnType<typeof createDreamDexExchange>
  onchain: MarketOnchain
  account: `0x${string}`
  marketSymbol?: string
  tradable?: string
  outcome: 'YES' | 'NO'
}) {
  const [yesRaw, noRaw] = await Promise.all([
    exchange.client.getOutcomeBalance({
      outcomeToken: onchain.outcomeToken,
      account,
      id: onchain.yesId,
    }),
    exchange.client.getOutcomeBalance({
      outcomeToken: onchain.outcomeToken,
      account,
      id: onchain.noId,
    }),
  ])
  const symbols = outcomeTradableSymbols(marketSymbol, tradable, outcome)
  const balances: Record<string, { total: number }> = {}
  if (symbols.yes) balances[symbols.yes] = { total: humanAmount(yesRaw, onchain.decimals) }
  if (symbols.no) balances[symbols.no] = { total: humanAmount(noRaw, onchain.decimals) }
  return balances
}

async function cachedMarketOnchain({
  exchange,
  marketId,
}: {
  exchange: ReturnType<typeof createDreamDexExchange>
  marketId: string
}): Promise<MarketOnchain> {
  const cached = getCachedMarketOnchain(marketId)
  if (cached) {
    console.info('[dreamdex-market-cache] market onchain cache hit', { marketId })
    return cached
  }

  console.info('[dreamdex-market-cache] market onchain cache miss', { marketId })
  const onchain = await exchange.client.getMarketOnchain(marketId as Hex)
  setCachedMarketOnchain(marketId, onchain)

  return onchain
}

async function cachedBinaryBookParams({
  exchange,
  pool,
}: {
  exchange: ReturnType<typeof createDreamDexExchange>
  pool: `0x${string}`
}): Promise<BinaryBookParams> {
  const cached = getCachedBinaryBookParams(pool)
  if (cached) {
    console.info('[dreamdex-market-cache] binary book params cache hit', { pool })
    return cached
  }

  console.info('[dreamdex-market-cache] binary book params cache miss', { pool })
  const params = await exchange.client.getBinaryBookParams(pool)
  setCachedBinaryBookParams(pool, params)

  return params
}

function orderResponse(
  order: PlaceOrderResult,
  quantity: bigint,
  decimals: number,
  symbol: string,
  price: number,
  side: 'buy' | 'sell',
) {
  const filledRaw = order.fills.reduce((total, fill) => total + fill.quantityFilled, BigInt(0))
  const filled = humanAmount(filledRaw, decimals)
  const amount = humanAmount(quantity, decimals)
  const remaining = Math.max(0, amount - filled)

  return {
    id: order.orderId?.toString(),
    symbol,
    type: 'market',
    side,
    price,
    amount,
    filled,
    remaining,
    status: filled > 0 ? 'closed' : 'canceled',
    txHash: order.hash,
    timestamp: Date.now(),
    datetime: new Date().toISOString(),
  } as const
}

function bestCrossPrice(book: BinaryOrderBook, outcome: 'YES' | 'NO', side: 'buy' | 'sell') {
  if (side === 'buy') {
    return outcome === 'YES' ? book.yesAsks[0]?.price : book.noAsks[0]?.price
  }

  return outcome === 'YES' ? book.yesBids[0]?.price : book.noBids[0]?.price
}

async function applyAbilityToPosition(input: {
  abilityId?: number
  address: string
  walletId: string
  marketId: string
  outcome: 'YES' | 'NO'
  side: 'buy' | 'sell'
  filled: number
  quotedQuantity: number
  stakeAmount: number
  proceeds: number
}) {
  try {
    if (input.side === 'buy' && input.abilityId && input.filled > 0) {
      const card = abilityCardById(input.abilityId)
      if (card) {
        const play = await recordAbilityBuy({
          abilityId: card.id,
          kind: card.kind,
          address: input.address,
          walletId: input.walletId,
          marketId: input.marketId,
          outcome: input.outcome,
          stakeAmount: input.stakeAmount,
          shares: input.filled,
        })
        void settleResolvedAbilityPlays(input.address).catch((error) => {
          console.error('Failed to settle resolved ability plays:', errorMessage(error))
        })
        return { play, settlement: null }
      }
    }

    if (input.side === 'sell' && input.filled > 0) {
      const settlement = await settleAbilityClose({
        address: input.address,
        marketId: input.marketId,
        outcome: input.outcome,
        soldShares: input.filled,
        proceeds: input.proceeds,
      })
      void settleResolvedAbilityPlays(input.address).catch((error) => {
        console.error('Failed to settle resolved ability plays:', errorMessage(error))
      })
      return { play: null, settlement }
    }
  } catch (error) {
    console.error('Ability apply failed:', errorMessage(error))
  }

  return { play: null, settlement: null }
}

export async function POST(request: Request) {
  const timer = createPositionDebugTimer()
  const body = await timer.wait(
    'request.json',
    request.json().catch(() => null),
  )
  const parseResult = placePositionBodySchema.safeParse(body)

  if (!parseResult.success) {
    console.info(`[trade-position-api:${timer.summary().id}] validation failed`, timer.summary())
    return Response.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
        debug: timer.summary(),
      },
      { status: 400 },
    )
  }

  const {
    wallet_id: walletId,
    market_id: marketId,
    market_symbol: marketSymbol,
    tradable,
    outcome,
    side,
    amount,
    slippage_percent: slippagePercent,
    ability_id,
  } = parseResult.data

  let exchange: ReturnType<typeof createDreamDexExchange> | null = null

  try {
    exchange = createDreamDexExchange()
    const authPromise = timer.wait('requirePrivyEthereumWallet', requirePrivyEthereumWallet(request, walletId))
    const onchainPromise = timer.wait('marketOnchain cachedOrFetch', cachedMarketOnchain({ exchange, marketId }))
    const [{ wallet }, onchain] = await Promise.all([authPromise, onchainPromise])

    const account = createViemAccount(privy, {
      walletId,
      address: wallet.address as `0x${string}`,
      authorizationContext,
    })

    exchange.setSigner({ account })

    if (onchain.status !== 1) {
      console.info(`[trade-position-api:${timer.summary().id}] market not trading`, {
        marketId,
        marketSymbol,
        onchainStatus: onchain.status,
        ...timer.summary(),
      })
      return Response.json(
        {
          error: 'This market is not trading on-chain anymore',
          marketId,
          marketSymbol,
          onchainStatus: onchain.status,
          debug: timer.summary(),
        },
        { status: 400 },
      )
    }

    const bookParams = await timer.wait(
      'binaryBookParams cachedOrFetch',
      cachedBinaryBookParams({ exchange, pool: onchain.pool }),
    )
    const binarySide = binarySideForPosition(outcome, side)
    const rawAmount = parseUnits(String(amount), onchain.decimals)
    const slippageBps = BigInt(Math.round(slippagePercent * 100))
    const oneCollateral = BigInt(10) ** BigInt(onchain.decimals)
    const retrySlippageBps = widenedRetrySlippageBps(slippageBps)
    const slippagePlan = retrySlippageBps ? [slippageBps, retrySlippageBps] : [slippageBps]

    let book: BinaryOrderBook | null = null
    let quote: BinaryStakeQuote | BinarySellQuote | null = null
    let order: PlaceOrderResult | null = null
    let usedSlippageBps = slippageBps

    for (const [index, nextSlippageBps] of slippagePlan.entries()) {
      const attempt = index + 1
      book = await timer.wait(
        `attempt ${attempt} exchange.client.getBinaryOrderBook`,
        exchange.client.getBinaryOrderBook(onchain.pool, { depth: 10, decimals: onchain.decimals }),
      )
      quote =
        side === 'buy'
          ? quoteBinaryStakeOverBook(book, binarySide as BinaryBuySide, rawAmount, oneCollateral, {
              ...bookParams,
              slippageBps: nextSlippageBps,
            })
          : quoteBinarySellOverBook(book, binarySide as BinarySellSide, rawAmount, oneCollateral, {
              ...bookParams,
              slippageBps: nextSlippageBps,
            })

      if (!quote) {
        console.info(`[trade-position-api:${timer.summary().id}] no fillable quote`, {
          attempt,
          marketId,
          marketSymbol,
          outcome,
          side,
          ...timer.summary(),
        })
        return Response.json(
          {
            error: `No fillable ${outcome} ${side === 'buy' ? 'ask' : 'bid'} liquidity is available for this amount`,
            marketId,
            marketSymbol,
            tradable,
            side,
            debug: timer.summary(),
          },
          { status: 400 },
        )
      }

      usedSlippageBps = nextSlippageBps

      try {
        order = await timer.wait(
          `attempt ${attempt} exchange.trader.placeOrder`,
          exchange.trader.placeOrder({
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
          }),
        )
        break
      } catch (error) {
        if (!isImmediateOrCancelNoFill(error) || attempt === slippagePlan.length) {
          throw error
        }

        console.info(`[trade-position-api:${timer.summary().id}] IOC no-fill; retrying with wider slippage`, {
          marketId,
          marketSymbol,
          outcome,
          side,
          attempt,
          nextSlippagePercent: Number(retrySlippageBps) / 100,
        })
      }
    }

    if (!book || !quote || !order) {
      throw new Error('Position order did not complete')
    }

    console.info(`[trade-position-api:${timer.summary().id}] complete`, timer.summary())

    const orderPayload = orderResponse(
      order,
      quote.quantity,
      onchain.decimals,
      tradable ?? `${marketId}#${outcome}`,
      humanAmount(quote.limitPrice, onchain.decimals),
      side,
    )
    const quotedQuantity = humanAmount(quote.quantity, onchain.decimals)
    const ability = await applyAbilityToPosition({
      abilityId: ability_id,
      address: wallet.address,
      walletId,
      marketId,
      outcome,
      side,
      filled: orderPayload.filled,
      quotedQuantity,
      stakeAmount:
        side === 'buy' ? humanAmount((quote as BinaryStakeQuote).escrow, onchain.decimals) || amount : amount,
      proceeds:
        side === 'sell' && quotedQuantity > 0
          ? humanAmount((quote as BinarySellQuote).estProceeds, onchain.decimals) *
            (orderPayload.filled / quotedQuantity)
          : 0,
    })
    const balances = await timer
      .wait(
        'outcomeBalances onchain',
        onchainOutcomeBalances({
          exchange,
          onchain,
          account: wallet.address as `0x${string}`,
          marketSymbol,
          tradable,
          outcome,
        }),
      )
      .catch((error) => {
        console.error('Read outcome balances after position failed:', errorMessage(error))
        return undefined
      })

    return Response.json({
      walletId,
      address: wallet.address,
      marketId,
      marketSymbol,
      outcome,
      side,
      tradable,
      bestPrice: humanAmount(bestCrossPrice(book, outcome, side) ?? BigInt(0), onchain.decimals),
      slippage: Number(usedSlippageBps) / 10_000,
      retry: {
        used: usedSlippageBps !== slippageBps,
        initialSlippagePercent: Number(slippageBps) / 100,
        usedSlippagePercent: Number(usedSlippageBps) / 100,
      },
      quote: {
        limitPrice: formatUnits(quote.limitPrice, onchain.decimals),
        quantity: formatUnits(quote.quantity, onchain.decimals),
        ...(side === 'buy'
          ? { escrow: formatUnits((quote as BinaryStakeQuote).escrow, onchain.decimals) }
          : {
              fillableQuantity: formatUnits((quote as BinarySellQuote).fillableQuantity, onchain.decimals),
              estProceeds: formatUnits((quote as BinarySellQuote).estProceeds, onchain.decimals),
            }),
      },
      order: orderPayload,
      balances,
      abilityPlay: ability.play,
      abilitySettlement: ability.settlement,
      debug: timer.summary(),
    })
  } catch (error) {
    console.error('Place DreamDex position failed:', {
      error,
      debug: timer.summary(),
    })

    if (error instanceof TradingApiError) {
      return Response.json(
        {
          error: error.message,
          ...error.context,
          marketSymbol,
          outcome,
          side,
          debug: timer.summary(),
        },
        { status: error.status },
      )
    }

    return Response.json(
      {
        error: 'Place DreamDex position failed',
        details: errorMessage(error),
        walletId,
        marketSymbol,
        outcome,
        side,
        debug: timer.summary(),
      },
      { status: 500 },
    )
  } finally {
    if (exchange) {
      await timer.wait('exchange.close', exchange.close())
    }
  }
}
