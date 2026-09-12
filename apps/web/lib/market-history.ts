import { BTC_ASSET } from '@/lib/btc'

export const HISTORY_ASSET = BTC_ASSET
export const HISTORY_INTERVAL_SECONDS = 5 * 60
export const HISTORY_PAGE_SIZE = 48
export const HISTORY_MIXED_PAGE_SIZE = 96

const openingPriceQuestion = 'BTC closes at or above its opening price'

export type HistoryOutcome = 'Y' | 'N'

export type HistoryMarket = {
  tradingStart: string | number
  winningOutcome: number | null
  voided?: boolean | null
  question?: string | null
  venueId?: string | null
}

export type HistorySeries = {
  venueId?: string | null
  question?: string | null
}

export function historySlotMs(tradingStart: string | number) {
  const seconds = Number(tradingStart)
  if (!Number.isFinite(seconds)) return null
  return seconds * 1000
}

export function historyOutcome(market: Pick<HistoryMarket, 'winningOutcome' | 'voided'>): HistoryOutcome | null {
  if (market.voided) return null
  if (market.winningOutcome === 0) return 'Y'
  if (market.winningOutcome === 1) return 'N'
  return null
}

export function historyOutcomes(markets: HistoryMarket[], series: HistorySeries = {}): Record<number, HistoryOutcome> {
  const outcomes: Record<number, HistoryOutcome> = {}

  for (const market of selectHistoryMarkets(markets, series)) {
    const slot = historySlotMs(market.tradingStart)
    const outcome = historyOutcome(market)
    if (slot == null || outcome == null) continue
    outcomes[slot] = outcome
  }

  return outcomes
}

function selectHistoryMarkets(markets: HistoryMarket[], series: HistorySeries) {
  const venueId = series.venueId?.toLowerCase()
  if (venueId) {
    const matched = markets.filter((market) => market.venueId?.toLowerCase() === venueId)
    if (matched.length > 0) return matched
  }

  const opening = markets.filter((market) => market.question === openingPriceQuestion)
  return opening.length > 0 ? opening : markets
}
