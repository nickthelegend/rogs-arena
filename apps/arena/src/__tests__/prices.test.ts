import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ORACLE_PROGRAM_ID, PRICE_UPDATE_DISCRIMINATOR } from '@rogs/arena-sdk'
import type { AccountInfo, PublicKey } from '@solana/web3.js'
import type { Server } from 'bun'
import { ArenaChain } from '../chain'
import type { PriceDoc } from '../db'
import { env } from '../env'
import { createFetchHandler } from '../http'
import {
  listPrices,
  PRICE_DEFAULT_LOOKBACK_MS,
  PRICE_QUERY_LIMIT,
  PRICE_RETENTION_MS,
  PriceHistory,
  PriceSampler,
  priceWindowStart,
  samplePrice,
  savePrices,
  type FeedReader,
} from '../prices'
import { RealtimeHub, type SocketData } from '../realtime'
import { parseInput, pricesQuerySchema } from '../schemas'
import type { PricePointDto, ServiceStatus } from '../types'
import { openTestDb, type TestDatabase } from './helpers'

// Sampling and window rules, the sampler tick (against a stand-in ER reader and against the devnet ER), the query on
// real Mongo (db rogs_arena_test) and /api/prices through the real HTTP handler on a local port.

const ATLAS_CONNECT_TIMEOUT_MS = 30_000
const HOUR = 60 * 60_000
const UNKNOWN_MARKET = 'market: market must be one of BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK'
const BAD_SINCE = 'since: since must be a non-negative integer'

const chain = new ArenaChain(env)
let db: TestDatabase
let hub: RealtimeHub
let server: Server<SocketData>
let base = ''

const serviceStatus = (): ServiceStatus => ({
  indexer: { enabled: false, lastSig: null, lastEventAt: null },
  keeper: { enabled: false, lastRollSig: null, lastRollAt: null },
  prices: { enabled: true, lastSampleAt: null },
})

// Stored rows expire an hour after the test, so Mongo's TTL monitor cannot remove them mid-test.
const row = (market: string, t: number, price: number): PriceDoc => ({ market, t, price, expiresAt: new Date(Date.now() + HOUR) })

/** A feed account in the MagicBlock PriceUpdateV2 layout that decodePriceUpdate reads, with 8 decimals. */
function feedAccount(feed: PublicKey, price: number, publishTime: number): AccountInfo<Buffer> {
  const data = Buffer.alloc(133)
  data.set(PRICE_UPDATE_DISCRIMINATOR, 0)
  data[40] = 1
  data.set(feed.toBytes(), 41)
  data.writeBigInt64LE(BigInt(Math.round(price * 1e8)), 73)
  data.writeInt32LE(-8, 89)
  data.writeBigInt64LE(BigInt(publishTime), 93)
  data.writeBigUInt64LE(BigInt(publishTime), 125)
  return { data, owner: ORACLE_PROGRAM_ID, executable: false, lamports: 1, rentEpoch: 0 }
}

async function get<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path)
  return { status: res.status, body: (await res.json()) as T }
}

beforeAll(async () => {
  db = await openTestDb()
  hub = new RealtimeHub(db.cols)
  server = Bun.serve<SocketData>({
    port: 0,
    fetch: createFetchHandler({ env, database: db, chain, hub, status: serviceStatus() }),
    websocket: hub.websocket,
  })
  hub.attach(server)
  base = `http://localhost:${server.port}`
}, ATLAS_CONNECT_TIMEOUT_MS)

afterAll(async () => {
  hub?.stop()
  await server?.stop(true)
  await db?.drop()
}, ATLAS_CONNECT_TIMEOUT_MS)

describe('price sampling decision', () => {
  const published = 1_789_281_871

  test('the first read of a feed is stored with t in ms and a 6 h expiry', () => {
    expect(samplePrice('SOL', { price: 101.43299778, publishTime: published }, undefined)).toEqual({
      market: 'SOL',
      t: published * 1000,
      price: 101.43299778,
      expiresAt: new Date(published * 1000 + 6 * HOUR),
    })
  })

  test('only a publish time newer than the last stored one is stored', () => {
    expect(samplePrice('SOL', { price: 101.44, publishTime: published }, published)).toBeNull()
    expect(samplePrice('SOL', { price: 101.44, publishTime: published - 1 }, published)).toBeNull()
    expect(samplePrice('SOL', { price: 101.44, publishTime: published + 1 }, published)?.t).toBe((published + 1) * 1000)
  })

  test('reads without a usable price or publish time are skipped', () => {
    expect(samplePrice('SOL', { price: 0, publishTime: published }, undefined)).toBeNull()
    expect(samplePrice('SOL', { price: Number.NaN, publishTime: published }, undefined)).toBeNull()
    expect(samplePrice('SOL', { price: 101, publishTime: 0 }, undefined)).toBeNull()
  })
})

describe('price query window', () => {
  const now = 1_789_281_871_000

  test('since defaults to an hour back and never reaches past six hours', () => {
    expect(PRICE_DEFAULT_LOOKBACK_MS).toBe(HOUR)
    expect(PRICE_RETENTION_MS).toBe(6 * HOUR)
    expect(priceWindowStart(undefined, now)).toBe(now - HOUR)
    expect(priceWindowStart(now - 5 * HOUR, now)).toBe(now - 5 * HOUR)
    expect(priceWindowStart(now - 7 * HOUR, now)).toBe(now - 6 * HOUR)
    expect(priceWindowStart(0, now)).toBe(now - 6 * HOUR)
    expect(priceWindowStart(now + 1_000, now)).toBe(now + 1_000)
  })

  test('query parameters: market is BTC when missing, since is an optional ms integer', () => {
    expect(parseInput(pricesQuerySchema, {})).toEqual({ market: 'BTC' })
    expect(parseInput(pricesQuerySchema, { market: 'DOGE', since: '1789281871000' })).toEqual({
      market: 'DOGE',
      since: 1_789_281_871_000,
    })
  })
})

describe('stored prices (Mongo)', () => {
  test('ascending, scoped to the market, from since, never older than six hours; duplicates are not rewritten', async () => {
    await db.cols.prices.deleteMany({})
    const now = Date.now()
    const ages = [7 * HOUR, 5 * HOUR, 2 * HOUR, 30 * 60_000, 1_000]
    expect(await savePrices(db.cols, ages.map((age, index) => row('SOL', now - age, 100 + index)))).toBe(5)
    expect(await savePrices(db.cols, [row('ETH', now - 2_000, 2_519.44)])).toBe(1)
    expect(await savePrices(db.cols, [row('SOL', now - 1_000, 999)])).toBe(0)

    expect(await listPrices(db.cols, 'SOL', undefined, now)).toEqual([
      { t: now - 30 * 60_000, price: 103 },
      { t: now - 1_000, price: 104 },
    ])
    expect((await listPrices(db.cols, 'SOL', 0, now)).map(point => point.price)).toEqual([101, 102, 103, 104])
    expect((await listPrices(db.cols, 'SOL', now - 3 * HOUR, now)).map(point => point.price)).toEqual([102, 103, 104])
    expect(await listPrices(db.cols, 'ETH', undefined, now)).toEqual([{ t: now - 2_000, price: 2_519.44 }])
    expect(await listPrices(db.cols, 'XRP', undefined, now)).toEqual([])
  }, 30_000)

  test('more than 2,000 matches return the most recent 2,000, oldest first', async () => {
    await db.cols.prices.deleteMany({})
    const now = Date.now()
    const count = PRICE_QUERY_LIMIT + 150
    await savePrices(db.cols, Array.from({ length: count }, (_, index) => row('BTC', now - (count - index) * 1_000, 77_000 + index)))
    const rows = await listPrices(db.cols, 'BTC', undefined, now)
    expect(rows).toHaveLength(PRICE_QUERY_LIMIT)
    expect(rows[0]).toEqual({ t: now - PRICE_QUERY_LIMIT * 1_000, price: 77_150 })
    expect(rows.at(-1)).toEqual({ t: now - 1_000, price: 77_000 + count - 1 })
    expect(rows.every((point, index) => index === 0 || point.t > rows[index - 1]!.t)).toBe(true)
  }, 60_000)
})

describe('price sampler', () => {
  test('one batched read per tick; a market is stored only when its publish time advanced; failures are survived', async () => {
    await db.cols.prices.deleteMany({})
    const { markets } = chain
    const start = Math.floor(Date.now() / 1000) - 10
    let publish = markets.map(() => start)
    let failure: Error | null = null
    const calls: PublicKey[][] = []
    // SUI's feed is missing and DOGE's is not a price account: both are skipped, the others still land.
    const reader: FeedReader = {
      getMultipleAccountsInfo: async (keys: PublicKey[]) => {
        calls.push(keys)
        if (failure) throw failure
        return markets.map((market, index) => {
          if (market.symbol === 'SUI') return null
          if (market.symbol === 'DOGE') return { ...feedAccount(market.oracleFeed, 1, start), data: Buffer.alloc(40) }
          return feedAccount(market.oracleFeed, 100 + index, publish[index]!)
        })
      },
    }
    const status = serviceStatus()
    const sampler = new PriceSampler(reader, markets, db.cols, status)

    expect(await sampler.sample()).toBe(7)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.map(key => key.toBase58())).toEqual(markets.map(market => market.oracleFeed.toBase58()))
    expect(status.prices.lastSampleAt).toBeNumber()
    expect((await db.cols.prices.findOne({ market: 'SOL' }, { projection: { _id: 0 } })) as PriceDoc | null).toEqual({
      market: 'SOL',
      t: start * 1000,
      price: 102,
      expiresAt: new Date(start * 1000 + PRICE_RETENTION_MS),
    })

    expect(await sampler.sample()).toBe(0)
    publish = publish.map((time, index) => (markets[index]!.symbol === 'SOL' ? time + 1 : time))
    expect(await sampler.sample()).toBe(1)
    expect((await listPrices(db.cols, 'SOL', undefined)).map(point => point.t)).toEqual([start * 1000, (start + 1) * 1000])

    failure = new Error('ER unreachable')
    expect(await sampler.sample()).toBe(0)
    failure = null
    publish = publish.map(time => time + 1)
    expect(await sampler.sample()).toBe(7)
    expect(calls).toHaveLength(5)
    expect(await db.cols.prices.countDocuments({})).toBe(15)
  }, 30_000)

  test('live: one read of the devnet oracle feeds on the ER stores a current price for every market', async () => {
    await db.cols.prices.deleteMany({})
    const sampler = new PriceSampler(chain.er, chain.markets, db.cols, serviceStatus())
    expect(await sampler.sample()).toBe(chain.markets.length)
    const now = Date.now()
    for (const market of chain.markets) {
      const points: PricePointDto[] = await listPrices(db.cols, market.symbol, undefined, now)
      expect(points).toHaveLength(1)
      expect(points[0]!.price).toBeGreaterThan(0)
      expect(Math.abs(now - points[0]!.t)).toBeLessThan(120_000)
    }
    const [sol] = await listPrices(db.cols, 'SOL', undefined, now)
    console.log(`[live] SOL/USD ${sol!.price} published ${new Date(sol!.t).toISOString()}`)
  }, 30_000)
})

describe('price history in memory', () => {
  test('answers only windows it covers from its start; repeated and out-of-order points are ignored', () => {
    const started = 1_789_281_871_000
    let now = started
    const history = new PriceHistory(() => now)
    history.add({ market: 'SOL', t: started - 5_000, price: 100 })
    now = started + 10_000
    history.add({ market: 'SOL', t: started + 8_000, price: 101 })
    history.add({ market: 'SOL', t: started + 8_000, price: 999 })
    history.add({ market: 'SOL', t: started + 7_000, price: 998 })

    expect(history.list('SOL', started + 1_000)).toEqual([{ t: started + 8_000, price: 101 }])
    expect(history.list('ETH', started + 1_000)).toEqual([])
    // Before the start, and the default hour back, are not covered: the caller reads Mongo instead.
    expect(history.list('SOL', started - 1_000)).toBeNull()
    expect(history.list('SOL', undefined)).toBeNull()
  })

  test('returns the newest 2,000 oldest first and forgets points past retention', () => {
    const started = 1_789_281_871_000
    let now = started
    const history = new PriceHistory(() => now)
    const count = PRICE_QUERY_LIMIT + 150
    for (let index = 0; index < count; index++) history.add({ market: 'BTC', t: started + index * 1_000, price: index })
    now = started + count * 1_000
    const rows = history.list('BTC', started)!
    expect(rows).toHaveLength(PRICE_QUERY_LIMIT)
    expect(rows[0]).toEqual({ t: started + 150_000, price: 150 })
    expect(rows.at(-1)).toEqual({ t: started + (count - 1) * 1_000, price: count - 1 })

    now = started + 7 * HOUR
    history.add({ market: 'BTC', t: now, price: -1 })
    expect(history.list('BTC', started)).toEqual([{ t: now, price: -1 }])
  })

  test('preload puts the stored last hour ahead of live points and covers that hour (Mongo)', async () => {
    await db.cols.prices.deleteMany({})
    const now = Date.now()
    await savePrices(db.cols, [row('ETH', now - 2 * HOUR, 2_400), row('ETH', now - 50 * 60_000, 2_500), row('ETH', now - 10_000, 2_510)])
    const history = new PriceHistory(() => now)
    history.add({ market: 'ETH', t: now - 10_000, price: 2_510 })
    history.add({ market: 'ETH', t: now - 1_000, price: 2_511 })
    expect(history.list('ETH', now - 30 * 60_000)).toBeNull()

    expect(await history.preload(db.cols, ['ETH', 'XRP'])).toEqual({ loaded: 2, failed: [] })
    expect(history.list('ETH', now - 55 * 60_000)).toEqual([
      { t: now - 50 * 60_000, price: 2_500 },
      { t: now - 10_000, price: 2_510 },
      { t: now - 1_000, price: 2_511 },
    ])
    expect(history.list('XRP', now - 30 * 60_000)).toEqual([])
    expect(history.list('ETH', now - 2 * HOUR)).toBeNull()
  }, 30_000)

  test('the sampler adds every new point to the history', async () => {
    await db.cols.prices.deleteMany({})
    const { markets } = chain
    const published = Math.floor(Date.now() / 1000)
    const reader: FeedReader = {
      getMultipleAccountsInfo: async () => markets.map((market, index) => feedAccount(market.oracleFeed, 100 + index, published)),
    }
    const history = new PriceHistory(() => (published - 60) * 1000)
    const sampler = new PriceSampler(reader, markets, db.cols, serviceStatus(), history)
    expect(await sampler.sample()).toBe(markets.length)
    const sol = markets.findIndex(market => market.symbol === 'SOL')
    expect(history.list('SOL', (published - 1) * 1000)).toEqual([{ t: published * 1000, price: 100 + sol }])
  }, 30_000)
})

describe('GET /api/prices with the in-memory history', () => {
  test('a covered window is served from memory and an older one from Mongo', async () => {
    await db.cols.prices.deleteMany({})
    const now = Date.now()
    await savePrices(db.cols, [row('DOGE', now - 2 * HOUR, 0.08)])
    const history = new PriceHistory()
    const since = Date.now()
    history.add({ market: 'DOGE', t: since + 5, price: 0.0841 })
    const local = Bun.serve<SocketData>({
      port: 0,
      fetch: createFetchHandler({ env, database: db, chain, hub, status: serviceStatus(), priceHistory: history }),
      websocket: hub.websocket,
    })
    try {
      const url = `http://localhost:${local.port}`
      expect(await (await fetch(`${url}/api/prices?market=DOGE&since=${since}`)).json()).toEqual([{ t: since + 5, price: 0.0841 }])
      expect(await (await fetch(`${url}/api/prices?market=DOGE&since=${now - 3 * HOUR}`)).json()).toEqual([{ t: now - 2 * HOUR, price: 0.08 }])
    } finally {
      await local.stop(true)
    }
  }, 30_000)
})

describe('GET /api/prices', () => {
  test('market defaults to BTC, rows are { t, price } only, unknown markets and bad since are 400', async () => {
    await db.cols.prices.deleteMany({})
    const now = Date.now()
    await savePrices(db.cols, [row('BTC', now - 4_000, 77_297.66), row('BTC', now - 2_000, 77_299), row('SOL', now - 2_000, 101.43)])

    expect(await get('/api/prices')).toEqual({
      status: 200,
      body: [
        { t: now - 4_000, price: 77_297.66 },
        { t: now - 2_000, price: 77_299 },
      ],
    })
    expect(await get(`/api/prices?market=SOL&since=${now - 3_000}`)).toEqual({ status: 200, body: [{ t: now - 2_000, price: 101.43 }] })
    expect(await get(`/api/prices?market=BTC&since=${now - 3_000}`)).toEqual({ status: 200, body: [{ t: now - 2_000, price: 77_299 }] })
    expect(await get('/api/prices?market=LINK')).toEqual({ status: 200, body: [] })

    for (const path of ['/api/prices?market=sol', '/api/prices?market=', '/api/prices?market=PEPE&since=1']) {
      expect(await get(path)).toEqual({ status: 400, body: { error: UNKNOWN_MARKET } })
    }
    for (const since of ['abc', '-5', '1.5', '']) {
      expect(await get(`/api/prices?market=SOL&since=${since}`)).toEqual({ status: 400, body: { error: BAD_SINCE } })
    }
    expect((await fetch(`${base}/api/prices`, { method: 'POST' })).status).toBe(405)
  }, 30_000)
})
