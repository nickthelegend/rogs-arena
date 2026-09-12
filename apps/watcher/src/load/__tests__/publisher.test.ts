import { describe, expect, test } from 'bun:test'
import { etlDebounceMs, etlHeartbeatMs } from '../../config.ts'
import type { MarketPoint, MarketTrade, WatcherSnapshot } from '../../types.ts'
import { createPublisher, type PublishStore, type PublisherClock } from '../publisher.ts'

function trade(overrides: Partial<MarketTrade> = {}): MarketTrade {
  return {
    id: '100_1',
    t: 1_700_000_000_000,
    marketId: 'm1',
    symbol: 'BTC',
    side: 'BUY_YES',
    kind: 'DIRECT_YES',
    outcome: 'YES',
    price: 0.61,
    amount: 2,
    cost: 1.22,
    taker: '0xtaker',
    ...overrides,
  }
}

function snapshot(overrides: Partial<WatcherSnapshot> = {}): WatcherSnapshot {
  return {
    phase: 'watching',
    marketId: 'm1',
    marketSymbol: 'BTC-m1',
    yes: 0.61,
    no: 0.39,
    source: 'book',
    fillCount: 1,
    fills: [],
    trades: [trade()],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function connecting(marketId = 'm1'): WatcherSnapshot {
  return snapshot({
    phase: 'connecting',
    marketId,
    yes: undefined,
    no: undefined,
    source: undefined,
    fillCount: 0,
    fills: [],
    trades: [],
    message: 'switching',
  })
}

function createFakeClock() {
  let now = 1_000_000
  let nextId = 1
  const timers = new Map<number, { id: number; at: number; fn: () => void }>()

  const clock: PublisherClock & { advance: (ms: number) => Promise<void> } = {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++
      timers.set(id, { id, at: now + ms, fn })
      return id
    },
    clearTimeout(id) {
      timers.delete(id as number)
    },
    async advance(ms) {
      now += ms
      while (true) {
        const due = [...timers.values()]
          .filter((timer) => timer.at <= now)
          .sort((left, right) => left.at - right.at || left.id - right.id)
        const timer = due[0]
        if (!timer) return
        timers.delete(timer.id)
        timer.fn()
        await Promise.resolve()
      }
    },
  }

  return clock
}

function createMemoryStore() {
  const points: MarketPoint[] = []
  const trades: Record<string, MarketTrade> = {}
  let clears = 0
  let remainingPushFailures = 0

  const store: PublishStore & {
    points: MarketPoint[]
    trades: Record<string, MarketTrade>
    clears: number
    failNextPushes: (count: number) => void
  } = {
    points,
    trades,
    get clears() {
      return clears
    },
    failNextPushes(count) {
      remainingPushFailures = count
    },
    async pushPoint(point) {
      if (remainingPushFailures > 0) {
        remainingPushFailures -= 1
        throw new Error('push failed')
      }
      points.push(point)
    },
    async upsertTrades(next) {
      Object.assign(trades, next)
    },
    async clear() {
      clears += 1
      points.length = 0
      for (const key of Object.keys(trades)) delete trades[key]
    },
  }

  return store
}

async function settle(writing: Promise<void>) {
  try {
    await writing
  } catch {
    // Tests assert store state after a rejected write.
  }
}

describe('createPublisher', () => {
  test('does not let a connecting snapshot steal a pending watching write', async () => {
    const clock = createFakeClock()
    const store = createMemoryStore()
    const publisher = createPublisher(store, clock)

    await settle(publisher.publish(snapshot({ yes: 0.6, no: 0.4, trades: [trade()] })))
    expect(store.points).toHaveLength(1)

    publisher.publish(
      snapshot({
        yes: 0.72,
        no: 0.28,
        updatedAt: 1_700_000_001_000,
        trades: [trade(), trade({ id: '100_2', price: 0.72 })],
      }),
    )
    publisher.publish(connecting('m1'))

    await clock.advance(etlDebounceMs)
    await settle(publisher.writing)

    expect(store.points.at(-1)?.yes).toBe(0.72)
    expect(store.trades['100_2']?.price).toBe(0.72)
    expect(store.clears).toBe(0)
  })

  test('keeps heartbeating after an error snapshot', async () => {
    const clock = createFakeClock()
    const store = createMemoryStore()
    const publisher = createPublisher(store, clock)

    await settle(publisher.publish(snapshot()))
    expect(store.points).toHaveLength(1)

    await settle(
      publisher.publish({
        phase: 'error',
        message: 'indexer timeout',
        fillCount: 0,
        fills: [],
        trades: [],
      }),
    )

    await clock.advance(etlHeartbeatMs)
    await settle(publisher.writing)

    expect(store.points).toHaveLength(2)
    expect(store.points.at(-1)?.yes).toBe(0.61)
  })

  test('retries a point after Firebase push fails', async () => {
    const clock = createFakeClock()
    const store = createMemoryStore()
    const publisher = createPublisher(store, clock)

    store.failNextPushes(1)
    await settle(publisher.publish(snapshot()))
    expect(store.points).toHaveLength(0)

    await clock.advance(etlHeartbeatMs)
    await settle(publisher.writing)

    expect(store.points).toHaveLength(1)
    expect(store.points[0]?.yes).toBe(0.61)
  })

  test('clears stale firebase data on market switch and does not rewrite the old market', async () => {
    const clock = createFakeClock()
    const store = createMemoryStore()
    const publisher = createPublisher(store, clock)

    await settle(publisher.publish(snapshot()))
    expect(store.trades['100_1']).toBeDefined()

    await settle(publisher.publish(connecting('m2')))
    expect(store.clears).toBe(1)
    expect(store.points).toHaveLength(0)
    expect(store.trades).toEqual({})

    await settle(
      publisher.publish(
        snapshot({
          marketId: 'm2',
          marketSymbol: 'BTC-m2',
          yes: 0.44,
          no: 0.56,
          trades: [trade({ id: '200_1', marketId: 'm2' })],
        }),
      ),
    )

    expect(store.points).toHaveLength(1)
    expect(store.points[0]?.marketId).toBe('m2')
    expect(store.trades['100_1']).toBeUndefined()
    expect(store.trades['200_1']?.marketId).toBe('m2')
  })

  test('holds incomplete trades until they have a time, then writes the resolved fill', async () => {
    const clock = createFakeClock()
    const store = createMemoryStore()
    const publisher = createPublisher(store, clock)

    await settle(publisher.publish(snapshot({ trades: [trade({ t: null })] })))
    expect(store.trades).toEqual({})

    publisher.publish(snapshot({ trades: [trade({ t: 1_700_000_000_500 })] }))
    await clock.advance(etlDebounceMs)
    await settle(publisher.writing)
    expect(store.trades['100_1']?.t).toBe(1_700_000_000_500)
  })
})
