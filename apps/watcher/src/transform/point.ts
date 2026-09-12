import type { MarketPoint, WatcherSnapshot } from '@/types'

function asJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function toMarketPoint(snapshot: WatcherSnapshot): MarketPoint | null {
  if (snapshot.yes === undefined || snapshot.no === undefined) return null

  return asJson({
    t: snapshot.updatedAt ?? Date.now(),
    yes: snapshot.yes,
    no: snapshot.no,
    source: snapshot.source ?? null,
    marketId: snapshot.marketId ?? null,
    symbol: snapshot.marketSymbol ?? null,
    expirySeconds: snapshot.expirySeconds ?? null,
  })
}

export function pointKey(snapshot: WatcherSnapshot) {
  return `${snapshot.marketId?.toLowerCase() ?? ''}:${snapshot.yes}:${snapshot.no}:${snapshot.source ?? ''}`
}

export function snapshotMarketId(snapshot: WatcherSnapshot) {
  return snapshot.marketId?.toLowerCase() ?? ''
}
