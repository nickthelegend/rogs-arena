import { isBinaryMarket, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { marketRefreshMs, successorPollHotMs, successorPollMsDefault, successorPollNearExpiryMs } from '@/config'
import { sleep } from '@/lib/async'
import type { WatchResult } from '@/types'

export function marketExpiryMs(market: UnifiedMarket) {
  if (!isBinaryMarket(market.info)) return Number.NaN
  const expiryMs = Number(market.info.expiry) * 1000
  return Number.isFinite(expiryMs) ? expiryMs : Number.NaN
}

export function isMarketExpired(market: UnifiedMarket, nowMs = Date.now()) {
  const expiryMs = marketExpiryMs(market)
  return Number.isFinite(expiryMs) && nowMs >= expiryMs
}

export function millisecondsUntilMarketExpiry(market: UnifiedMarket) {
  const expiryMs = marketExpiryMs(market)
  if (!Number.isFinite(expiryMs)) return marketRefreshMs
  return Math.max(0, expiryMs - Date.now())
}

export function successorPollMs(market: UnifiedMarket) {
  const remainingMs = millisecondsUntilMarketExpiry(market)
  if (remainingMs <= successorPollNearExpiryMs) return successorPollHotMs
  return successorPollMsDefault
}

export async function waitUntilMarketExpiry(market: UnifiedMarket, signal: AbortSignal): Promise<WatchResult | void> {
  await sleep(millisecondsUntilMarketExpiry(market), signal)
  if (signal.aborted) return
  return { event: 'market_expired' }
}
