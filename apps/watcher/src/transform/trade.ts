import { rawToHuman, rawToProbability } from '@/lib/units'
import type { MarketTrade, Outcome } from '@/types'
import type { LiveFill } from '@somnia-chain/markets-sdk'

export { firebaseKey as tradeKey } from '@repo/shared/firebase-path'

function asJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function fillTimestampMs(timestamp: string | undefined) {
  if (!timestamp) return undefined
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) return undefined
  return seconds * 1000
}

export function tradeOutcome(side?: string | null, kind?: string | null): Outcome | null {
  const token = `${side ?? ''} ${kind ?? ''}`
  if (token.includes('YES')) return 'YES'
  if (token.includes('NO')) return 'NO'
  return null
}

export function toMarketTrade(
  fill: LiveFill,
  quoteDecimals: number,
  baseDecimals: number,
  marketId: string | null,
  symbol: string | null,
): MarketTrade {
  return asJson({
    id: fill.id,
    t: fillTimestampMs(fill.timestamp) ?? null,
    marketId,
    symbol,
    side: fill.takerSide ?? null,
    kind: fill.kind ?? null,
    outcome: tradeOutcome(fill.takerSide, fill.kind),
    price: rawToProbability(fill.fillPrice, quoteDecimals) ?? null,
    amount: rawToHuman(fill.quantity, baseDecimals) ?? null,
    cost: rawToHuman(fill.quoteQuantity, quoteDecimals) ?? null,
    taker: fill.taker ?? null,
  })
}

export function toMarketTrades(
  fills: LiveFill[],
  quoteDecimals: number,
  baseDecimals: number,
  marketId: string | null,
  symbol: string | null,
): MarketTrade[] {
  return fills.map((fill) => toMarketTrade(fill, quoteDecimals, baseDecimals, marketId, symbol))
}

export function unpublishedTrades(trades: MarketTrade[], publishedIds: Iterable<string>) {
  const seen = publishedIds instanceof Set ? publishedIds : new Set(publishedIds)
  return trades.filter((trade) => trade.id && !seen.has(trade.id))
}
