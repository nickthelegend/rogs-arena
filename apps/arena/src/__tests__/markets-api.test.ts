import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { MARKET_ROUND_BASE } from '@rogs/arena-sdk'
import { Keypair } from '@solana/web3.js'
import type { Server } from 'bun'
import { ArenaChain } from '../chain'
import { migrateMarkets } from '../db'
import { env } from '../env'
import { createFetchHandler } from '../http'
import type { RoundOpenedUpdate } from '../mappers'
import { marketOfRound } from '../markets'
import { RealtimeHub, type SocketData } from '../realtime'
import { applyRoundOpened, saveCheers, saveClose, savePoint, saveSettlement, saveTrade } from '../store'
import type { ArenaSnapshot, MarketDto, PointDto, SettlementDto, TradeDto } from '../types'
import { openTestDb, type TestDatabase } from './helpers'

// Real Mongo (db rogs_arena_test), the real HTTP handler and WebSocket hub on a local port, and the devnet ER for
// the arena reads behind /api/markets and /health.

const ATLAS_CONNECT_TIMEOUT_MS = 30_000
const eth = (n: number) => MARKET_ROUND_BASE + n
const sol = (n: number) => 2 * MARKET_ROUND_BASE + n
const UNKNOWN_MARKET = 'market: market must be one of BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK'

const alice = Keypair.generate().publicKey.toBase58()
const bob = Keypair.generate().publicKey.toBase58()

let db: TestDatabase
let hub: RealtimeHub
let server: Server<SocketData>
let base = ''

const round = (roundId: number, startTs: number): RoundOpenedUpdate => ({
  market: marketOfRound(roundId),
  roundId,
  startTs,
  endTs: startTs + 300,
  strikePrice: '6512345678901',
  priceExpo: 8,
  liquidity: 200,
  openedSig: `open-${roundId}`,
})

const trade = (roundId: number, owner: string, t: number): TradeDto => ({
  id: `trade-${roundId}-${owner}`,
  sig: `sig-${roundId}`,
  market: marketOfRound(roundId),
  roundId,
  owner,
  side: 'SELL',
  outcome: 'YES',
  amount: 5,
  shares: 8,
  price: 0.625,
  yesPrice: 0.54,
  fee: 0.05,
  realizedPnl: 1.25,
  ability: 0,
  t,
})

const settlement = (roundId: number, owner: string, t: number): SettlementDto => ({
  id: `settle-${roundId}-${owner}`,
  sig: `settle-sig-${roundId}`,
  market: marketOfRound(roundId),
  roundId,
  owner,
  outcome: 'YES',
  payout: 12,
  profit: 7,
  ability: 0,
  bonus: 0,
  calm: false,
  cheers: false,
  t,
})

async function get<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path)
  return { status: res.status, body: (await res.json()) as T }
}

beforeAll(async () => {
  db = await openTestDb()
  const cols = db.cols
  for (const [roundId, startTs] of [
    [1, 1_000],
    [2, 1_300],
    [eth(1), 1_000],
    [eth(2), 1_300],
    [sol(1), 1_300],
  ] as const) {
    await applyRoundOpened(cols, round(roundId, startTs))
  }
  const trades = [trade(2, alice, 1_301_000), trade(eth(2), alice, 1_302_000), trade(sol(1), bob, 1_303_000)]
  for (const item of trades) {
    await saveTrade(cols, item)
    await savePoint(cols, item.id, { market: item.market, roundId: item.roundId, t: item.t, yes: 0.54, no: 0.46, source: 'chain' })
    await saveClose(cols, {
      id: item.id,
      market: item.market,
      roundId: item.roundId,
      trader: item.owner,
      outcome: 'YES',
      exit: 'tp',
      profit: 1.25,
      shares: 8,
      t: item.t,
    })
  }
  await saveSettlement(cols, settlement(1, alice, 1_300_000))
  await saveSettlement(cols, settlement(eth(1), alice, 1_300_500))
  await saveSettlement(cols, settlement(sol(1), bob, 1_600_000))

  const chain = new ArenaChain(env)
  hub = new RealtimeHub(cols)
  const status = {
    indexer: { enabled: false, lastSig: null, lastEventAt: null },
    keeper: { enabled: false, lastRollSig: null, lastRollAt: null },
  }
  server = Bun.serve<SocketData>({
    port: 0,
    fetch: createFetchHandler({ env, database: db, chain, hub, status }),
    websocket: hub.websocket,
  })
  hub.attach(server)
  hub.start()
  base = `http://localhost:${server.port}`
}, ATLAS_CONNECT_TIMEOUT_MS)

afterAll(async () => {
  hub?.stop()
  await server?.stop(true)
  await db?.drop()
}, ATLAS_CONNECT_TIMEOUT_MS)

describe('HTTP routes scope to the market', () => {
  test('rounds: missing market is BTC, ETH lists only ETH, unknown is 400', async () => {
    const btc = await get<{ market: string; roundId: number }[]>('/api/rounds')
    expect(btc.status).toBe(200)
    expect(btc.body.map(row => [row.market, row.roundId])).toEqual([
      ['BTC', 2],
      ['BTC', 1],
    ])
    const ethRounds = await get<{ market: string; roundId: number }[]>('/api/rounds?market=ETH&limit=1')
    expect(ethRounds.body.map(row => [row.market, row.roundId])).toEqual([['ETH', eth(2)]])
    for (const path of ['/api/rounds?market=eth', '/api/rounds?market=', '/api/arena?market=PEPE', `/api/trades?market=Sol&roundId=${sol(1)}`]) {
      expect(await get(path)).toEqual({ status: 400, body: { error: UNKNOWN_MARKET } })
    }
  })

  test('trades, points and closes: a round id only matches inside its own market', async () => {
    const trades = await get<TradeDto[]>(`/api/trades?market=ETH&roundId=${eth(2)}`)
    expect(trades.body.map(row => [row.market, row.roundId, row.owner])).toEqual([['ETH', eth(2), alice]])
    expect((await get<TradeDto[]>(`/api/trades?roundId=${eth(2)}`)).body).toEqual([])
    expect((await get<TradeDto[]>('/api/trades?roundId=2')).body.map(row => row.market)).toEqual(['BTC'])
    const points = await get<PointDto[]>(`/api/points?market=SOL&roundId=${sol(1)}`)
    expect(points.body).toEqual([{ market: 'SOL', roundId: sol(1), t: 1_303_000, yes: 0.54, no: 0.46, source: 'chain' }])
    const closes = await get<{ market: string; trader: string }[]>(`/api/closes?market=SOL&roundId=${sol(1)}`)
    expect(closes.body.map(row => [row.market, row.trader])).toEqual([['SOL', bob]])
    expect((await get(`/api/closes?market=ETH&roundId=${sol(1)}`)).body).toEqual([])
  })

  test('settlements: owner-only spans all markets, otherwise one market', async () => {
    const all = await get<SettlementDto[]>(`/api/settlements?owner=${alice}`)
    expect(all.body.map(row => [row.market, row.roundId])).toEqual([
      ['BTC', 1],
      ['ETH', eth(1)],
    ])
    expect((await get<SettlementDto[]>(`/api/settlements?owner=${alice}&market=ETH`)).body.map(row => row.roundId)).toEqual([eth(1)])
    expect((await get<SettlementDto[]>('/api/settlements')).body.map(row => row.market)).toEqual(['BTC'])
    expect((await get(`/api/settlements?roundId=${sol(1)}`)).body).toEqual([])
    expect((await get<SettlementDto[]>(`/api/settlements?roundId=${sol(1)}&market=SOL`)).body.map(row => row.owner)).toEqual([bob])
  })

  test('arena snapshot is per market; a market without rounds has none', async () => {
    const solSnapshot = await get<ArenaSnapshot>('/api/arena?market=SOL')
    expect(solSnapshot.body.market).toBe('SOL')
    expect(solSnapshot.body.round?.roundId).toBe(sol(1))
    expect(solSnapshot.body.recentRounds.map(row => row.roundId)).toEqual([sol(1)])
    expect(solSnapshot.body.trades.map(row => row.id)).toEqual([`trade-${sol(1)}-${bob}`])
    expect(solSnapshot.body.closes).toHaveLength(1)
    const btcSnapshot = await get<ArenaSnapshot>('/api/arena')
    expect(btcSnapshot.body).toMatchObject({ market: 'BTC', round: { market: 'BTC', roundId: 2 } })
    const xrp = await get<ArenaSnapshot>('/api/arena?market=XRP')
    expect(xrp.body).toMatchObject({ market: 'XRP', round: null, recentRounds: [], trades: [], points: [], closes: [] })
    expect(Array.isArray(xrp.body.chat) && Array.isArray(xrp.body.traders)).toBe(true)
  })

  test('/api/markets and /health list all nine markets with live ER availability', async () => {
    const markets = await get<MarketDto[]>('/api/markets')
    expect(markets.status).toBe(200)
    expect(markets.body.map(row => row.market)).toEqual(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX', 'LINK'])
    expect(markets.body[0]).toMatchObject({ market: 'BTC', id: 0, available: true, arena: 'ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ' })
    expect(markets.body[1]!.round).toMatchObject({ market: 'ETH', roundId: eth(2) })
    expect(markets.body[3]!.round).toBeNull()

    const health = await get<{ arena: unknown; markets: { market: string; available: boolean }[] }>('/health')
    expect(health.status).toBe(200)
    expect(health.body.markets.map(row => row.market)).toEqual(markets.body.map(row => row.market))
    expect(health.body.markets.map(row => row.available)).toEqual(markets.body.map(row => row.available))
    expect(health.body.arena).toMatchObject({ status: expect.any(String), roundId: expect.any(Number) })
  }, 30_000)
})

type Frame = { type: string; [key: string]: any }

class Client {
  readonly frames: Frame[] = []
  readonly socket: WebSocket
  readonly opened: Promise<void>

  constructor() {
    this.socket = new WebSocket(`${base.replace('http', 'ws')}/ws`)
    this.opened = new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve()
      this.socket.onerror = () => reject(new Error('socket error'))
    })
    this.socket.onmessage = event => this.frames.push(JSON.parse(String(event.data)))
  }

  send(data: unknown) {
    this.socket.send(JSON.stringify(data))
  }

  /** The first frame after the current one that matches. */
  async next(predicate: (frame: Frame) => boolean, timeoutMs = 8_000): Promise<Frame> {
    const from = this.frames.length
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const found = this.frames.slice(from).find(predicate)
      if (found) return found
      await Bun.sleep(20)
    }
    throw new Error(`no matching frame; got ${this.frames.slice(from).map(frame => frame.type).join(', ') || 'nothing'}`)
  }
}

describe('WebSocket market switch', () => {
  test('hello picks the snapshot market, market frames switch it, unknown markets are errors', async () => {
    const client = new Client()
    await client.opened

    const early = client.next(frame => frame.type === 'error')
    client.send({ type: 'market', market: 'SOL' })
    expect((await early).error).toBe('Send hello first')

    let reply = client.next(frame => frame.type === 'snapshot')
    client.send({ type: 'hello', sessionId: `tab-${crypto.randomUUID()}`, market: 'ETH' })
    const ethSnapshot = (await reply).data as ArenaSnapshot
    expect(ethSnapshot.market).toBe('ETH')
    expect(ethSnapshot.round?.roundId).toBe(eth(2))
    expect(ethSnapshot.trades.map(row => row.market)).toEqual(['ETH'])

    reply = client.next(frame => frame.type === 'snapshot')
    client.send({ type: 'market', market: 'SOL' })
    const solSnapshot = (await reply).data as ArenaSnapshot
    expect(solSnapshot).toMatchObject({ market: 'SOL', round: { roundId: sol(1) } })

    const rejected = client.next(frame => frame.type === 'error')
    client.send({ type: 'market', market: 'sol' })
    expect((await rejected).error).toBe(UNKNOWN_MARKET)
    const badHello = client.next(frame => frame.type === 'error')
    client.send({ type: 'hello', sessionId: 'tab-x', market: 'DOGE2' })
    expect((await badHello).error).toBe(UNKNOWN_MARKET)

    const legacy = new Client()
    await legacy.opened
    reply = legacy.next(frame => frame.type === 'snapshot')
    legacy.send({ type: 'hello', sessionId: `tab-${crypto.randomUUID()}` })
    expect(((await reply).data as ArenaSnapshot).market).toBe('BTC')

    // Broadcasts reach every client whatever market it watches; the DTO names the market.
    const ethTrade = trade(eth(2), bob, 1_400_000)
    const toSol = client.next(frame => frame.type === 'trade')
    const toBtc = legacy.next(frame => frame.type === 'trade')
    hub.broadcast('trade', { trade: ethTrade })
    expect((await toSol).trade).toEqual(ethTrade)
    expect((await toBtc).trade.market).toBe('ETH')

    client.socket.close()
    legacy.socket.close()
  }, 30_000)
})

describe('legacy documents', () => {
  test('migration stamps market from the round id (cheers: BTC) and is idempotent', async () => {
    const raw = db.db
    await raw.collection('rounds').insertMany([{ roundId: 50, startTs: 1 }, { roundId: eth(50), startTs: 1 }])
    await raw.collection('trades').insertMany([{ id: 'legacy-trade-1', roundId: 50, owner: alice, t: 1 }, { id: 'legacy-trade-2', roundId: sol(50), owner: bob, t: 2 }])
    await raw.collection('points').insertOne({ key: 'legacy-point', roundId: eth(50), t: 1 })
    await raw.collection('closes').insertOne({ id: 'legacy-close', roundId: 8 * MARKET_ROUND_BASE + 50, t: 1 })
    await raw.collection('settlements').insertOne({ id: 'legacy-settlement', roundId: 50, owner: alice, t: 1 })
    await raw.collection('cheers').insertOne({ sig: 'legacy-cheers', owner: alice, t: 1 })

    expect(await migrateMarkets(db.cols)).toEqual({ rounds: 2, trades: 2, points: 1, closes: 1, settlements: 1, cheers: 1 })
    const marketOf = async (name: string, filter: Record<string, unknown>) => (await raw.collection(name).findOne(filter))?.market
    expect(await marketOf('rounds', { roundId: 50 })).toBe('BTC')
    expect(await marketOf('rounds', { roundId: eth(50) })).toBe('ETH')
    expect(await marketOf('trades', { id: 'legacy-trade-2' })).toBe('SOL')
    expect(await marketOf('points', { key: 'legacy-point' })).toBe('ETH')
    expect(await marketOf('closes', { id: 'legacy-close' })).toBe('LINK')
    expect(await marketOf('settlements', { id: 'legacy-settlement' })).toBe('BTC')
    expect(await marketOf('cheers', { sig: 'legacy-cheers' })).toBe('BTC')
    expect(await migrateMarkets(db.cols)).toEqual({ rounds: 0, trades: 0, points: 0, closes: 0, settlements: 0, cheers: 0 })
  }, 30_000)

  test('a cheers saved before its market was known gets it from a later pass, without a second insert', async () => {
    const cheers = { sig: 'cheers-late', market: null, owner: alice, recipients: [bob], amountEach: 1, randomness: '00', t: 5 }
    expect(await saveCheers(db.cols, cheers)).toBe(true)
    expect(await saveCheers(db.cols, { ...cheers, market: 'ETH' })).toBe(false)
    expect(await saveCheers(db.cols, { ...cheers, market: 'SOL' })).toBe(false)
    const docs = await db.cols.cheers.find({ sig: 'cheers-late' }).toArray()
    expect(docs.map(doc => doc.market)).toEqual(['ETH'])
  }, 30_000)
})
