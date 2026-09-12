import type { LivelineMarker } from '@/lib/liveline'
import { formatAddress } from '@/lib/format'
import { getAvatar } from '@/lib/avatar'

export type MarketTrade = {
  id: string
  t: number
  marketId?: string | null
  symbol?: string | null
  side?: string | null
  kind?: string | null
  outcome?: 'YES' | 'NO' | null
  price?: number | null
  amount?: number | null
  cost?: number | null
  taker?: string | null
}

function tradeTimeSeconds(t: number) {
  return t > 1e12 ? t / 1000 : t
}

export function marketTradeOutcome(trade: Pick<MarketTrade, 'outcome' | 'side' | 'kind'>): 'YES' | 'NO' | null {
  if (trade.outcome === 'YES' || trade.outcome === 'NO') return trade.outcome
  const token = `${trade.side ?? ''} ${trade.kind ?? ''}`
  if (token.includes('YES')) return 'YES'
  if (token.includes('NO')) return 'NO'
  return null
}

export function marketTradeAction(trade: Pick<MarketTrade, 'side' | 'kind'>): 'buy' | 'sell' | null {
  const token = `${trade.side ?? ''} ${trade.kind ?? ''}`
  if (token.includes('SELL')) return 'sell'
  if (token.includes('BUY')) return 'buy'
  return null
}

function tradeSeriesId(trade: MarketTrade): 'yes' | 'no' | null {
  const outcome = marketTradeOutcome(trade)
  if (outcome === 'YES') return 'yes'
  if (outcome === 'NO') return 'no'
  return null
}

export function isMarketTrade(id: string, value: unknown): value is Omit<MarketTrade, 'id'> {
  if (!value || typeof value !== 'object') return false
  const trade = value as MarketTrade
  return Boolean(id) && Number.isFinite(trade.t)
}

export function toTradeMarkers(trades: MarketTrade[]): LivelineMarker[] {
  return trades.flatMap((trade) => {
    const time = tradeTimeSeconds(trade.t)
    const seriesId = tradeSeriesId(trade)
    if (!Number.isFinite(time) || !seriesId) return []

    const seed = trade.taker || trade.id
    return [
      {
        id: trade.id,
        time,
        seriesId,
        avatar: getAvatar(seed),
        name: trade.taker ? formatAddress(trade.taker) : undefined,
      },
    ]
  })
}
