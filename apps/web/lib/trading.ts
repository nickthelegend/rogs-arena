import { formatNumber, formatShares } from '@/lib/format'
import { formatAbilitySettlement, type AbilitySettlement } from '@/lib/ability-payout'
import { isBinaryMarket, type UnifiedMarket } from '@somnia-chain/markets-sdk'

export const DEFAULT_TRADE_AMOUNT = 5
export const DEFAULT_SLIPPAGE_PERCENT = 5

export type Outcome = 'YES' | 'NO'
export type TradeSide = 'buy' | 'sell'

export type OutcomePosition = {
  label: Outcome
  symbol: string
  total: number
}

export type TradingBalances = Record<string, { total?: number } | undefined>

export type TradingStatus =
  | { tone: 'neutral'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }

export type PlacePositionResult = {
  order: {
    status: string
    filled: number
    amount: number
    txHash?: string
  }
  balances?: TradingBalances
  abilityPlay?: { id: string } | null
  abilitySettlement?: AbilitySettlement | null
}

export type RewardClaim = {
  marketId: string
  outcome: Outcome
  amount: string
  hash: string
}

export type RewardClaimResult = {
  scanned: number
  claimed: RewardClaim[]
  skipped: { marketId: string; reason: string; outcome?: Outcome }[]
  balances?: TradingBalances | null
  abilitySettlements?: AbilitySettlement[]
}

type TradingApiError = {
  error?: string
  details?: unknown
}

export function tradingApiErrorMessage(result: unknown, fallback: string) {
  if (!result || typeof result !== 'object') return fallback

  const response = result as TradingApiError
  if (typeof response.details === 'string' && response.details.length > 0) return response.details
  return response.error ?? fallback
}

export function binaryMarketId(market: UnifiedMarket | null) {
  if (!market || !isBinaryMarket(market.info)) return null
  return market.info.marketId
}

export function tradableForOutcome(market: UnifiedMarket | null, outcome: Outcome) {
  return market?.outcomes?.find((item) => item.label === outcome)?.symbol ?? null
}

export function outcomePositions(market: UnifiedMarket | null, balances: TradingBalances | null): OutcomePosition[] {
  return (['YES', 'NO'] as const).map((label) => {
    const symbol = tradableForOutcome(market, label)
    return {
      label,
      symbol: symbol ?? label,
      total: symbol ? (balances?.[symbol]?.total ?? 0) : 0,
    }
  })
}

export function positionTotal(positions: OutcomePosition[], outcome: Outcome) {
  return positions.find((position) => position.label === outcome)?.total ?? 0
}

export function applyPositionFill(
  balances: TradingBalances | null,
  input: { symbol: string | null; side: TradeSide; filled: number },
): TradingBalances | null {
  if (!input.symbol || input.filled <= 0) return balances

  const current = balances?.[input.symbol]?.total ?? 0
  const total = input.side === 'buy' ? current + input.filled : Math.max(0, current - input.filled)
  return { ...(balances ?? {}), [input.symbol]: { total } }
}

export function balancesAfterPosition(input: {
  current: TradingBalances | null
  reported?: TradingBalances | null
  symbol: string | null
  side: TradeSide
  filled: number
}): TradingBalances | null {
  const applied = applyPositionFill(input.current, input)
  if (!input.reported) return applied
  if (!input.symbol) return { ...(applied ?? {}), ...input.reported }

  const { [input.symbol]: reportedLot, ...restReported } = input.reported
  const next: TradingBalances = { ...(applied ?? {}), ...restReported }
  const appliedTotal = applied?.[input.symbol]?.total
  const reportedTotal = reportedLot?.total

  if (reportedTotal == null) return Object.keys(next).length > 0 ? next : applied
  if (appliedTotal == null) {
    next[input.symbol] = { total: reportedTotal }
    return next
  }

  next[input.symbol] = {
    total: input.side === 'buy' ? Math.max(appliedTotal, reportedTotal) : Math.min(appliedTotal, reportedTotal),
  }
  return next
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
  return positions.filter((position) => position.total > 0 && (!outcome || position.label === outcome))
}

export function canTakeProfit(input: {
  walletId?: string | null
  marketId?: string | null
  positions: OutcomePosition[]
  busy?: boolean
}) {
  return Boolean(input.walletId && input.marketId && !input.busy && sellablePositions(input.positions).length > 0)
}

export function placePositionBody(input: {
  walletId: string
  marketId: string
  marketSymbol: string
  tradable: string
  outcome: Outcome
  side: TradeSide
  amount?: number
  slippagePercent?: number
  abilityId?: number
}) {
  return {
    wallet_id: input.walletId,
    market_id: input.marketId,
    market_symbol: input.marketSymbol,
    tradable: input.tradable,
    outcome: input.outcome,
    side: input.side,
    amount: input.amount ?? DEFAULT_TRADE_AMOUNT,
    slippage_percent: input.slippagePercent ?? DEFAULT_SLIPPAGE_PERCENT,
    ...(input.abilityId != null ? { ability_id: input.abilityId } : {}),
  }
}

export function claimRewardsBody(walletId: string, marketIds?: string[]) {
  return {
    wallet_id: walletId,
    ...(marketIds?.length ? { market_ids: marketIds } : {}),
  }
}

export function settleAbilitiesBody(walletId: string, extra?: { marketId?: string; abilityId?: number }) {
  return {
    wallet_id: walletId,
    ...(extra?.marketId ? { market_id: extra.marketId } : {}),
    ...(extra?.abilityId != null ? { ability_id: extra.abilityId } : {}),
  }
}

export function formatTradeResultMessage(input: {
  side: TradeSide
  outcome: Outcome
  filled: number
  amount: number
}) {
  return `${input.side === 'buy' ? 'Bought' : 'Sold'} ${input.outcome}. Filled ${formatNumber(input.filled)} of ${formatNumber(input.amount)}.`
}

export function formatClaimResultMessage(claimed: number) {
  if (claimed <= 0) return 'No settled rewards to claim yet.'
  return `Claimed ${claimed} reward${claimed === 1 ? '' : 's'}.`
}

export function formatTakeProfitResultMessage(
  results: { outcome: Outcome; filled: number; amount: number }[],
) {
  if (results.length === 0) return 'No shares to sell.'
  if (results.length === 1) {
    const [result] = results
    return formatTradeResultMessage({ side: 'sell', ...result })
  }

  return `Sold ${results.map((result) => `${formatNumber(result.filled)} ${result.outcome}`).join(' and ')}.`
}

export function withAbilityMessage(message: string, settlement?: AbilitySettlement | null) {
  if (!settlement) return message
  const extra = formatAbilitySettlement(settlement)
  return extra ? `${message} ${extra}` : message
}
