import type { PricePointDto } from '@/lib/arena-api'
import type { PriceFeedStatus } from '@/lib/format'
import type { LivelinePoint } from '@/lib/liveline'
import { normalizePricePoints } from '@/lib/utils'
import type { OraclePrice } from '@rogs/arena-sdk'

// State behind the price chart: stored oracle samples from the arena service plus live reads of the feed account.

export type MarketPriceState = {
  /** The feed these values were read from; a coin switch ignores the previous feed's state. */
  feed: string | null
  latest: OraclePrice | null
  points: LivelinePoint[]
  status: PriceFeedStatus
  error: string | null
}

export const initialPriceState: MarketPriceState = { feed: null, latest: null, points: [], status: 'hydrating', error: null }

/** `state` when it belongs to `feed`; otherwise a fresh state for it, so the previous coin's points are dropped. */
export function priceStateFor(state: MarketPriceState, feed: string): MarketPriceState {
  return state.feed === feed ? state : { ...initialPriceState, feed }
}

/** Stored samples (`t` in ms) merged under chart points (unix seconds); a live point wins a second both have. */
export function mergePriceHistory(points: readonly LivelinePoint[], history: readonly PricePointDto[]) {
  const stored = history.map((point) => ({ time: Math.floor(point.t / 1000), value: point.price }))
  // Stored samples go first: normalizePricePoints keeps the last of the points sharing a time.
  return normalizePricePoints([...stored, ...points])
}

/** A live read of the feed: appended unless its posted slot is not newer than the latest read's. */
export function applyOraclePrice(state: MarketPriceState, feed: string, price: OraclePrice): MarketPriceState {
  const current = priceStateFor(state, feed)
  if (current.latest && price.postedSlot <= current.latest.postedSlot) {
    return current === state && current.status === 'live' ? state : { ...current, status: 'live', error: null }
  }
  return {
    feed,
    latest: price,
    points: normalizePricePoints([...current.points, { time: price.publishTime, value: price.price }]),
    status: 'live',
    error: null,
  }
}

/** The service's stored samples for `feed`, whether they land before or after the first live read. */
export function applyPriceHistory(state: MarketPriceState, feed: string, history: readonly PricePointDto[]): MarketPriceState {
  const current = priceStateFor(state, feed)
  if (history.length === 0) return current
  return { ...current, points: mergePriceHistory(current.points, history) }
}
