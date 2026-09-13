import { formatShares, formatUsd } from '@/lib/format'
import {
  ABILITY_CALM,
  ABILITY_CHEERS,
  ABILITY_DOUBLE,
  ABILITY_LOCK_SECONDS,
  ABILITY_NONE,
  ABILITY_PROTECT,
  chipsToUsd,
  MAX_TRADE,
  MIN_TRADE,
  OUTCOME_NO,
  OUTCOME_YES,
  quoteBuy,
  quoteSell,
  TRADE_LOCK_SECONDS,
  usdToChips,
  withSlippage,
  type ArenaMarket,
  type OutcomeCode,
  type PositionSettled,
  type PositionState,
} from '@rogs/arena-sdk'

export const DEFAULT_TRADE_AMOUNT = 5
export const DEFAULT_SLIPPAGE_PERCENT = 5

export type Outcome = 'YES' | 'NO'
export type TradeSide = 'buy' | 'sell'

/** `total` is shares in USD units (1 share pays $1 if it wins); `shares` is the raw on-chain amount. */
export type OutcomePosition = {
  label: Outcome
  symbol: string
  total: number
  shares: bigint
}

type StatusLink = { signature?: string; explorerUrl?: string }

export type TradingStatus =
  | ({ tone: 'neutral'; message: string } & StatusLink)
  | ({ tone: 'success'; message: string } & StatusLink)
  | ({ tone: 'error'; message: string } & StatusLink)

export type PlaceTradeResult = {
  signature: string
  ms: number
  abilityPlay: { id: string } | null
}

export type MarketPools = Pick<ArenaMarket, 'yesPool' | 'noPool' | 'feeBps'>

type PlayerPositions = { positions: PositionState[] }

export function binaryMarketId(market: ArenaMarket | null) {
  return market?.info.marketId ?? null
}

export function tradableForOutcome(market: Pick<ArenaMarket, 'outcomes'> | null, outcome: Outcome) {
  return market?.outcomes.find((item) => item.label === outcome)?.symbol ?? null
}

export function outcomeCode(outcome: Outcome): OutcomeCode {
  return outcome === 'YES' ? OUTCOME_YES : OUTCOME_NO
}

export function roundPosition(player: PlayerPositions | null, roundId: number | null | undefined) {
  if (!player || roundId == null) return null
  return player.positions.find((position) => position.active && position.roundId === roundId) ?? null
}

export function outcomePositions(
  market: Pick<ArenaMarket, 'outcomes' | 'roundId'> | null,
  player: PlayerPositions | null,
): OutcomePosition[] {
  const position = roundPosition(player, market?.roundId)
  return (['YES', 'NO'] as const).map((label) => {
    const shares = position ? (label === 'YES' ? position.yesShares : position.noShares) : 0n
    return {
      label,
      symbol: tradableForOutcome(market, label) ?? label,
      total: chipsToUsd(shares),
      shares,
    }
  })
}

export function positionTotal(positions: OutcomePosition[], outcome: Outcome) {
  return positions.find((position) => position.label === outcome)?.total ?? 0
}

export function formatPositionLine(positions: OutcomePosition[]) {
  return `YES ${formatShares(positionTotal(positions, 'YES'))} · NO ${formatShares(positionTotal(positions, 'NO'))}`
}

export function canPlaceTrade(input: {
  walletId?: string | null
  marketId?: string | null
  tradable?: string | null
  busy?: boolean
}) {
  return Boolean(input.walletId && input.marketId && input.tradable && !input.busy)
}

export function sellablePositions(positions: OutcomePosition[], outcome?: Outcome) {
  return positions.filter((position) => position.shares > 0n && (!outcome || position.label === outcome))
}

export function canTakeProfit(input: {
  walletId?: string | null
  marketId?: string | null
  positions: OutcomePosition[]
  busy?: boolean
}) {
  return Boolean(input.walletId && input.marketId && !input.busy && sellablePositions(input.positions).length > 0)
}

const abilityCodes = new Set([ABILITY_DOUBLE, ABILITY_PROTECT, ABILITY_CALM, ABILITY_CHEERS])

/** Card ids 1..4 in lib/ability.ts are the on-chain ability codes. */
export function abilityCode(abilityId?: number | null) {
  if (abilityId == null) return ABILITY_NONE
  if (!abilityCodes.has(abilityId)) throw new Error(`Unknown ability card ${abilityId}.`)
  return abilityId
}

/** Why a buy, sell, or card attach cannot go through right now, or null when it can. */
export function tradeBlockedReason(
  market: Pick<ArenaMarket, 'active' | 'info'> | null,
  nowSeconds: number,
  options: { ability?: boolean } = {},
) {
  if (!market) return 'No live round is open yet.'
  if (!market.active) return 'This round has ended. The next round opens when the crank rolls it.'
  if (options.ability && nowSeconds >= market.info.expiry - ABILITY_LOCK_SECONDS) {
    return `Ability cards lock ${ABILITY_LOCK_SECONDS} seconds before the round ends. Remove the card to trade now.`
  }
  if (nowSeconds >= market.info.expiry - TRADE_LOCK_SECONDS) {
    return `Trading is locked for the last ${TRADE_LOCK_SECONDS} seconds of the round.`
  }
  return null
}

export function validateTradeAmount(amountUsd: number) {
  if (!Number.isFinite(amountUsd)) throw new Error('Enter a trade amount.')
  const chips = usdToChips(amountUsd)
  if (chips < MIN_TRADE) throw new Error(`The smallest trade is ${formatUsd(chipsToUsd(MIN_TRADE))}.`)
  if (chips > MAX_TRADE) throw new Error(`The largest trade is ${formatUsd(chipsToUsd(MAX_TRADE))}.`)
  return chips
}

function poolsFor(pools: Pick<MarketPools, 'yesPool' | 'noPool'>, outcome: Outcome) {
  return outcome === 'YES' ? { mine: pools.yesPool, other: pools.noPool } : { mine: pools.noPool, other: pools.yesPool }
}

/** FPMM buy quote against the live on-chain pools; `minShares` carries the slippage bound. */
export function buyQuote(pools: MarketPools, outcome: Outcome, amountUsd: number, slippage = DEFAULT_SLIPPAGE_PERCENT) {
  const amount = validateTradeAmount(amountUsd)
  const { mine, other } = poolsFor(pools, outcome)
  const quote = quoteBuy(mine, other, amount, pools.feeBps)
  if (!quote) throw new Error('The pool cannot quote this buy right now.')
  return { amount, shares: quote.shares, minShares: withSlippage(quote.shares, slippage) }
}

/** FPMM sell quote; `pools` is what the round looks like after this sale, for quoting the next lot. */
export function sellQuote(pools: MarketPools, outcome: Outcome, shares: bigint, slippage = DEFAULT_SLIPPAGE_PERCENT) {
  const { mine, other } = poolsFor(pools, outcome)
  const quote = quoteSell(mine, other, shares, pools.feeBps)
  if (!quote) throw new Error(`The pool cannot quote selling ${formatShares(chipsToUsd(shares))} ${outcome} right now.`)
  return {
    out: quote.out,
    minOut: withSlippage(quote.out, slippage),
    pools: {
      yesPool: outcome === 'YES' ? quote.poolSold : quote.poolOther,
      noPool: outcome === 'YES' ? quote.poolOther : quote.poolSold,
      feeBps: pools.feeBps,
    },
  }
}

function signedUsd(value: number) {
  return `${value >= 0 ? '+' : '-'}${formatUsd(Math.abs(value))}`
}

function erLatency(ms: number) {
  return `${Math.round(ms)} ms on the MagicBlock ER`
}

export type TradeFill = {
  side: TradeSide
  outcome: Outcome
  /** Shares in USD units, or null when the receipt could not be read. */
  shares: number | null
  /** Gross USD in for a buy, net USD out for a sell, or null when unknown. */
  usd: number | null
  ms: number
}

export function formatTradeResultMessage(fill: TradeFill) {
  const verb = fill.side === 'buy' ? 'Bought' : 'Sold'
  const size = fill.shares == null ? fill.outcome : `${formatShares(fill.shares)} ${fill.outcome}`
  const value = fill.usd == null ? '' : ` for ${formatUsd(fill.usd)}`
  return `${verb} ${size}${value} in ${erLatency(fill.ms)}.`
}

export function formatTakeProfitResultMessage(fills: TradeFill[]) {
  if (fills.length === 0) return 'No shares to sell.'
  if (fills.length === 1) return formatTradeResultMessage(fills[0] as TradeFill)
  const parts = fills.map((fill) => `${fill.shares == null ? '' : `${formatShares(fill.shares)} `}${fill.outcome}`)
  const usd = fills.every((fill) => fill.usd != null) ? ` for ${formatUsd(fills.reduce((sum, fill) => sum + (fill.usd ?? 0), 0))}` : ''
  return `Sold ${parts.join(' and ')}${usd}.`
}

export type SettlementSummary = Pick<PositionSettled, 'roundId' | 'payout' | 'profit' | 'ability' | 'bonus' | 'calm' | 'cheers'>

export function abilitySettlementNote(settled: SettlementSummary) {
  const bonus = chipsToUsd(settled.bonus)
  switch (settled.ability) {
    case ABILITY_DOUBLE:
      return bonus > 0 ? `Double price paid ${formatUsd(bonus)}.` : 'Double price did not pay: the position did not profit.'
    case ABILITY_PROTECT:
      return bonus > 0 ? `Protect loss refunded ${formatUsd(bonus)}.` : 'Protect loss did not pay: the position did not lose.'
    case ABILITY_CALM:
      if (bonus > 0) return `Calm pulse paid ${formatUsd(bonus)}: your on-chain heart rate stayed under 120 bpm.`
      return settled.profit > 0n
        ? 'Calm pulse did not pay: no calm heart rate under 120 bpm was recorded on-chain this round.'
        : 'Calm pulse did not pay: the position did not profit.'
    case ABILITY_CHEERS:
      return settled.cheers
        ? 'Cheers won: MagicBlock VRF will pick up to 10 traders to receive $1 each.'
        : 'Cheers did not trigger: the position did not profit.'
    default:
      return null
  }
}

export function formatSettlementMessage(settled: SettlementSummary[]) {
  if (settled.length === 0) return 'No resolved positions to settle yet.'
  const payout = settled.reduce((sum, item) => sum + chipsToUsd(item.payout), 0)
  const profit = settled.reduce((sum, item) => sum + chipsToUsd(item.profit), 0)
  const bonus = settled.reduce((sum, item) => sum + chipsToUsd(item.bonus), 0)
  const count = `${settled.length} position${settled.length === 1 ? '' : 's'}`
  const base = `Settled ${count}: paid ${formatUsd(payout + bonus)}, P/L ${signedUsd(profit)}.`
  const notes = settled.map(abilitySettlementNote).filter((note): note is string => Boolean(note))
  return [base, ...notes].join(' ')
}

export function formatClaimResultMessage(settledCount: number) {
  if (settledCount <= 0) return 'No resolved positions to settle yet.'
  return `Settled ${settledCount} position${settledCount === 1 ? '' : 's'}.`
}

export type ExitQuote = { out: number; profit: number }

/**
 * What selling each side of the open position pays right now: the program's AMM sell quote on the live
 * pools, after the fee, minus that side's cost basis. This is exactly what `sell` realizes, unlike a
 * mark-price estimate, so TP/SL labels and island PnL match the fill.
 */
export function exitQuotesFor(
  market: Pick<ArenaMarket, 'yesPool' | 'noPool' | 'feeBps'> | null,
  position: Pick<PositionState, 'yesShares' | 'noShares' | 'basisYes' | 'basisNo'> | null,
): Record<Outcome, ExitQuote | null> {
  const quote = (outcome: Outcome): ExitQuote | null => {
    if (!market || !position) return null
    const shares = outcome === 'YES' ? position.yesShares : position.noShares
    if (shares <= 0n) return null
    const sold = outcome === 'YES' ? market.yesPool : market.noPool
    const other = outcome === 'YES' ? market.noPool : market.yesPool
    const result = quoteSell(sold, other, shares, market.feeBps)
    if (!result) return null
    const basis = outcome === 'YES' ? position.basisYes : position.basisNo
    return { out: chipsToUsd(result.out), profit: chipsToUsd(result.out - basis) }
  }
  return { YES: quote('YES'), NO: quote('NO') }
}

export function withAbilityMessage(message: string, note?: string | null) {
  return note ? `${message} ${note}` : message
}
