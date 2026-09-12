import {
  claimHeader,
  claimableOutcomes,
  formatClaimRow,
  formatPosition,
  humanAmount,
  settlementResult,
  type Claimed,
  type ClaimRow,
} from '@/claim/result'
import { createDreamDexExchange } from '@/dreamdex'
import { errorMessage } from '@/lib/async'
import { defaultInterval, intervalSecondsByLabel, type IntervalOption } from '@/market'
import { wallets, type BotWallet } from '@/wallets'
import { estPayoutFor, type ClaimablePosition, type MarketOnchain, type OpenPositionPnL, type SomniaMarkets } from '@somnia-chain/markets-sdk'
import type { Hex } from 'viem'

export type ClaimRewardsOptions = {
  dryRun?: boolean
  window?: IntervalOption
  all?: boolean
  marketId?: string
}

type WalletMarket = {
  marketId: Hex
  symbol: string
  decimals: number
  yes: number
  no: number
  pnl: number
}

function asMarketId(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`).toLowerCase() as Hex
}

function marketSymbol(position: OpenPositionPnL) {
  const interval = position.market.interval ?? ''
  const asset = position.market.asset || 'MARKET'
  return interval ? `${asset}-${interval}` : asset
}

function matchesScope(position: OpenPositionPnL, options: ClaimRewardsOptions) {
  if (options.marketId) return position.market.id.toLowerCase() === options.marketId.toLowerCase()
  if (options.all) return true

  const window = options.window ?? defaultInterval
  const intervalSeconds = Number(position.market.intervalSec)
  const expected = intervalSecondsByLabel[window]
  if (Number.isFinite(intervalSeconds) && intervalSeconds !== expected) return false
  if (position.market.interval && position.market.interval !== window) return false
  return position.market.asset.toUpperCase().startsWith('BTC')
}

function isSettled(position: OpenPositionPnL) {
  return (
    position.market.voided ||
    position.market.winningOutcome != null ||
    position.market.status === 'Resolved' ||
    position.market.status === 'Voided' ||
    position.market.status === 'Finalized'
  )
}

function pnlOf(position: OpenPositionPnL) {
  return humanAmount(position.realizedPnl + position.unrealizedPnl, position.market.quoteDecimals)
}

async function loadWalletMarkets(
  reader: SomniaMarkets,
  wallet: BotWallet,
  options: ClaimRewardsOptions,
): Promise<WalletMarket[]> {
  const [open, claimable] = await Promise.all([
    reader.client.getOpenPositionsWithPnL(wallet.address).catch(() => [] as OpenPositionPnL[]),
    reader.client.getClaimable(wallet.address).catch(() => [] as ClaimablePosition[]),
  ])

  const markets = new Map<string, WalletMarket>()

  for (const position of open) {
    if (!matchesScope(position, options)) continue
    if (!isSettled(position) && !claimable.some((item) => item.marketId.toLowerCase() === position.market.id.toLowerCase())) {
      continue
    }

    const marketId = asMarketId(position.market.id)
    markets.set(marketId, {
      marketId,
      symbol: marketSymbol(position),
      decimals: position.market.quoteDecimals,
      yes: humanAmount(position.balanceYes, position.market.quoteDecimals),
      no: humanAmount(position.balanceNo, position.market.quoteDecimals),
      pnl: pnlOf(position),
    })
  }

  for (const item of claimable) {
    const id = item.marketId.toLowerCase()
    if (markets.has(id)) continue
    if (options.marketId && id !== options.marketId.toLowerCase()) continue
    if (!options.all && !options.marketId) continue

    const pnl = await reader.client.getBinaryPositionPnL(wallet.address, id).catch(() => null)
    const decimals = 6
    markets.set(id, {
      marketId: asMarketId(id),
      symbol: item.status,
      decimals,
      yes: humanAmount(pnl?.balanceYes ?? 0n, decimals),
      no: humanAmount(pnl?.balanceNo ?? 0n, decimals),
      pnl: pnl ? humanAmount(pnl.realizedPnl + pnl.unrealizedPnl, decimals) : 0,
    })
  }

  return [...markets.values()]
}

async function outcomeBalances(reader: SomniaMarkets, onchain: MarketOnchain, account: `0x${string}`) {
  const [yes, no] = await Promise.all([
    reader.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account, id: onchain.yesId }),
    reader.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account, id: onchain.noId }),
  ])
  return { yes, no }
}

function payoutFor(onchain: MarketOnchain, marketId: Hex, outcomeIdx: 0 | 1, amount: bigint) {
  return estPayoutFor({
    marketId,
    pool: onchain.pool,
    outcomeIdx,
    amount,
    winningOutcome: onchain.isVoided ? null : onchain.winningOutcome,
    voided: onchain.isVoided,
    status: onchain.isVoided ? 'Voided' : 'Resolved',
    settlementFeeBps: 0n,
  })
}

async function redeemOutcome(
  writer: SomniaMarkets,
  onchain: MarketOnchain,
  marketId: Hex,
  outcomeIdx: 0 | 1,
  amount: bigint,
  dryRun: boolean,
) {
  if (dryRun) return { claimed: 'dry' as const, note: undefined }

  const tx = await writer.trader.redeem({
    marketId,
    market: onchain.marketAddress,
    outcomeToken: onchain.outcomeToken,
    outcomeIdx,
    amount,
  })

  if (tx.receipt.status !== 'success') {
    return { claimed: 'fail' as const, note: tx.hash }
  }

  return { claimed: 'yes' as const, note: tx.hash.slice(0, 10) }
}

async function claimWallet(
  reader: SomniaMarkets,
  writerFor: (wallet: BotWallet) => SomniaMarkets,
  wallet: BotWallet,
  options: ClaimRewardsOptions,
  onchainCache: Map<string, MarketOnchain>,
): Promise<ClaimRow[]> {
  const markets = await loadWalletMarkets(reader, wallet, options)
  const rows: ClaimRow[] = []

  for (const market of markets) {
    let onchain = onchainCache.get(market.marketId)
    if (!onchain) {
      onchain = await reader.client.getMarketOnchain(market.marketId)
      onchainCache.set(market.marketId, onchain)
    }

    const live = await outcomeBalances(reader, onchain, wallet.address)
    const yes = Math.max(market.yes, humanAmount(live.yes, onchain.decimals))
    const no = Math.max(market.no, humanAmount(live.no, onchain.decimals))
    const result = settlementResult({
      isVoided: onchain.isVoided,
      isResolved: onchain.isResolved,
      winningOutcome: onchain.winningOutcome,
      yes,
      no,
    })

    const row: ClaimRow = {
      wallet: wallet.address,
      symbol: market.symbol,
      position: formatPosition(yes, no),
      result,
      claimed: 'no',
      amount: 0,
      pnl: market.pnl,
    }

    const outcomes = claimableOutcomes(onchain)
    if (outcomes.length === 0) {
      rows.push(row)
      continue
    }

    let claimed: Claimed = 'no'
    let amount = 0n
    const notes: string[] = []

    for (const outcome of outcomes) {
      const balance = outcome.index === 0 ? live.yes : live.no
      if (balance === 0n) continue

      try {
        const redeemed = await redeemOutcome(
          options.dryRun ? reader : writerFor(wallet),
          onchain,
          market.marketId,
          outcome.index,
          balance,
          Boolean(options.dryRun),
        )
        amount += payoutFor(onchain, market.marketId, outcome.index, balance)
        if (redeemed.claimed === 'yes' || redeemed.claimed === 'dry') claimed = redeemed.claimed
        if (redeemed.claimed === 'fail') claimed = 'fail'
        if (redeemed.note) notes.push(redeemed.note)
      } catch (error) {
        claimed = 'fail'
        notes.push(errorMessage(error))
      }
    }

    rows.push({
      ...row,
      claimed,
      amount: humanAmount(amount, onchain.decimals),
      note: notes[0],
    })
  }

  return rows
}

export async function claimRewards(options: ClaimRewardsOptions = {}) {
  const roster = wallets()
  if (roster.length === 0) {
    throw new Error('No generated wallets. Run `bun run generate-wallets` first.')
  }

  const reader = createDreamDexExchange()
  const writers = new Map<string, SomniaMarkets>()
  const onchainCache = new Map<string, MarketOnchain>()

  function writerFor(wallet: BotWallet) {
    const key = wallet.address.toLowerCase()
    const existing = writers.get(key)
    if (existing) return existing

    const writer = createDreamDexExchange({ account: wallet.account })
    writers.set(key, writer)
    return writer
  }

  try {
    const groups = await Promise.all(
      roster.map((wallet) => claimWallet(reader, writerFor, wallet, options, onchainCache)),
    )
    return groups.flat()
  } finally {
    await Promise.all([reader.close(), ...[...writers.values()].map((writer) => writer.close())])
  }
}

export function printClaimRows(rows: ClaimRow[]) {
  console.log(claimHeader)
  if (rows.length === 0) {
    console.log('  no settled positions')
    return
  }

  for (const row of rows) {
    console.log(formatClaimRow(row))
  }
}
