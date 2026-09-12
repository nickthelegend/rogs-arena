import { etlDebounceMs, etlHeartbeatMs } from '@/config'
import { pointKey, snapshotMarketId, toMarketPoint } from '@/transform/point'
import { tradeKey } from '@/transform/trade'
import type { MarketPoint, MarketTrade, WatcherSnapshot } from '@/types'

export type PublishStore = {
  pushPoint: (point: MarketPoint) => Promise<void>
  upsertTrades: (trades: Record<string, MarketTrade>) => Promise<void>
  clear: () => Promise<void>
}

export type PublisherClock = {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

const defaultClock: PublisherClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}

function identityOf(snapshot: WatcherSnapshot) {
  return `${snapshot.phase}:${snapshot.marketId ?? ''}`
}

export function createPublisher(store: PublishStore, clock: PublisherClock = defaultClock) {
  let pending: WatcherSnapshot | undefined
  let timer: unknown
  let heartbeat: unknown
  let lastIdentity = ''
  let lastMarketId = ''
  let lastPointKey = ''
  let lastPublishedAt = 0
  let writing = Promise.resolve()
  let inFlight = false
  let queued = false
  let pendingClear = false
  let clearTo = ''
  let publishedFingerprints = new Map<string, string>()

  function scheduleHeartbeat() {
    clock.clearTimeout(heartbeat)
    heartbeat = clock.setTimeout(() => {
      requestFlush(true)
    }, etlHeartbeatMs)
  }

  function requestFlush(immediate: boolean) {
    if (!immediate) {
      clock.clearTimeout(timer)
      timer = clock.setTimeout(() => requestFlush(true), etlDebounceMs)
      return writing
    }

    clock.clearTimeout(timer)
    timer = undefined
    queued = true
    if (!inFlight) writing = run()
    return writing
  }

  async function run() {
    inFlight = true
    try {
      while (queued) {
        queued = false
        try {
          await flush()
        } catch (error) {
          scheduleHeartbeat()
          throw error
        }
      }
    } finally {
      inFlight = false
      if (queued) writing = run()
    }
  }

  function fingerprint(trade: MarketTrade) {
    return JSON.stringify(trade)
  }

  function isCompleteTrade(trade: MarketTrade) {
    return Boolean(trade.id) && trade.t != null && Number.isFinite(trade.t)
  }

  function hasPayload(snapshot: WatcherSnapshot) {
    return toMarketPoint(snapshot) !== null || (snapshot.trades?.some((trade) => trade.id) ?? false)
  }

  async function writeNewTrades(snapshot: WatcherSnapshot) {
    const fresh = (snapshot.trades ?? []).filter((trade) => {
      if (!isCompleteTrade(trade)) return false
      return publishedFingerprints.get(trade.id) !== fingerprint(trade)
    })
    if (fresh.length === 0) return

    const updates: Record<string, MarketTrade> = {}
    for (const trade of fresh) {
      updates[tradeKey(trade.id)] = trade
    }

    await store.upsertTrades(updates)
    for (const trade of fresh) {
      publishedFingerprints.set(trade.id, fingerprint(trade))
    }
  }

  async function flush() {
    if (pendingClear) {
      await store.clear()
      lastPointKey = ''
      lastPublishedAt = 0
      publishedFingerprints = new Map()
      pendingClear = false
      lastMarketId = clearTo
      if (pending && snapshotMarketId(pending) !== lastMarketId) pending = undefined
    }

    const snapshot = pending
    if (!snapshot) {
      clock.clearTimeout(heartbeat)
      heartbeat = undefined
      return
    }

    const marketId = snapshotMarketId(snapshot)
    if (marketId) lastMarketId = marketId

    await writeNewTrades(snapshot)

    const point = toMarketPoint(snapshot)
    if (!point) {
      scheduleHeartbeat()
      return
    }

    const key = pointKey(snapshot)
    const stale = clock.now() - lastPublishedAt >= etlHeartbeatMs
    if (key === lastPointKey && !stale) {
      scheduleHeartbeat()
      return
    }

    await store.pushPoint(point)
    lastPointKey = key
    lastPublishedAt = clock.now()
    scheduleHeartbeat()
  }

  function publish(snapshot: WatcherSnapshot) {
    const marketId = snapshotMarketId(snapshot)
    const marketChanged = Boolean(lastMarketId && marketId && marketId !== lastMarketId)
    const payload = hasPayload(snapshot)
    const identity = identityOf(snapshot)
    const identityChanged = identity !== lastIdentity

    if (marketChanged) {
      pendingClear = true
      clearTo = marketId
    }

    if (payload) {
      pending = snapshot
      lastIdentity = identity
    }

    if (!payload && !marketChanged) return writing

    return requestFlush(identityChanged || marketChanged)
  }

  return {
    publish,
    get writing() {
      return writing
    },
  }
}

export type Publisher = ReturnType<typeof createPublisher>
