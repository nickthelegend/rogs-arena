import { MARKET_ROUND_BASE } from '@rogs/arena-sdk'
import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb'
import { DEFAULT_MARKET, MARKET_SYMBOLS } from './markets'
import type { CheersDto, CloseDto, PointDto, RoundDto, SettlementDto, TradeDto } from './types'

export type UserDoc = {
  wallet: string
  displayName: string | null
  isBot: boolean
  createdAt: number
  updatedAt: number
}
export type PointDoc = PointDto & { key: string }
export type ChatDoc = { _id?: ObjectId; address: string; name: string; message: string; t: number }
export type FaucetDoc = {
  _id?: ObjectId
  wallet: string
  ip: string
  ts: number
  status: 'pending' | 'sent'
  signature: string | null
  lamports: number | null
}
export type NonceDoc = {
  _id?: ObjectId
  wallet: string
  nonce: string
  message: string
  createdAt: Date
  expiresAt: Date
}
export type SessionDoc = { token: string; wallet: string; createdAt: Date; expiresAt: Date }
/** Keeper state for one market; see keeperMetaId in keeper.ts. */
export type MetaDoc = {
  _id: string
  commits?: number
  lastCommitRound?: number
  lastCommitSig?: string
  lastCommitAt?: number
  settledThrough?: number
}
/** One MagicBlock oracle sample; `t` is the feed's publish time in ms, `expiresAt` drives the 6 h TTL. */
export type PriceDoc = { market: string; t: number; price: number; expiresAt: Date }
export type KeeperLogDoc = {
  t: number
  level: 'info' | 'warn' | 'error'
  action: string
  message: string
  sig: string | null
  error: string | null
}

export type Collections = {
  users: Collection<UserDoc>
  trades: Collection<TradeDto>
  rounds: Collection<RoundDto>
  points: Collection<PointDoc>
  closes: Collection<CloseDto>
  settlements: Collection<SettlementDto>
  cheers: Collection<CheersDto>
  chat: Collection<ChatDoc>
  faucet: Collection<FaucetDoc>
  nonces: Collection<NonceDoc>
  sessions: Collection<SessionDoc>
  meta: Collection<MetaDoc>
  keeper_log: Collection<KeeperLogDoc>
  prices: Collection<PriceDoc>
}

export type Database = {
  client: MongoClient
  db: Db
  cols: Collections
  keeperLogCapped: boolean
}

export const KEEPER_LOG_MAX = 500

export function getCollections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>('users'),
    trades: db.collection<TradeDto>('trades'),
    rounds: db.collection<RoundDto>('rounds'),
    points: db.collection<PointDoc>('points'),
    closes: db.collection<CloseDto>('closes'),
    settlements: db.collection<SettlementDto>('settlements'),
    cheers: db.collection<CheersDto>('cheers'),
    chat: db.collection<ChatDoc>('chat'),
    faucet: db.collection<FaucetDoc>('faucet'),
    nonces: db.collection<NonceDoc>('nonces'),
    sessions: db.collection<SessionDoc>('sessions'),
    meta: db.collection<MetaDoc>('meta'),
    keeper_log: db.collection<KeeperLogDoc>('keeper_log'),
    prices: db.collection<PriceDoc>('prices'),
  }
}

export async function connectDb(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: 'rogs-arena' })
  await client.connect()
  const db = client.db(dbName)
  const keeperLogCapped = await ensureKeeperLog(db)
  const cols = getCollections(db)
  await ensureIndexes(cols)
  const migrated = await migrateMarkets(cols)
  const stamped = Object.entries(migrated).filter(([, count]) => count > 0)
  if (stamped.length) console.log(`[db] stamped market on legacy documents: ${stamped.map(([name, count]) => `${name} ${count}`).join(', ')}`)
  return { client, db, cols, keeperLogCapped }
}

/** Creates keeper_log as a capped collection when possible; returns whether it is capped. */
async function ensureKeeperLog(db: Db): Promise<boolean> {
  const [existing] = await db.listCollections({ name: 'keeper_log' }).toArray()
  if (existing) return Boolean((existing as { options?: { capped?: boolean } }).options?.capped)
  try {
    await db.createCollection('keeper_log', { capped: true, size: 1_048_576, max: KEEPER_LOG_MAX })
    return true
  } catch (error) {
    // Some Atlas tiers refuse capped collections; the keeper trims to KEEPER_LOG_MAX itself.
    console.warn(`[db] keeper_log is not capped, trimming manually: ${(error as Error).message}`)
    return false
  }
}

/**
 * Stamps `market` on documents written before multi-market support. Round-scoped documents derive it from their
 * namespaced roundId (every legacy id is BTC's, and this stays right for any other market's id); cheers carry no
 * round id and predate the other arenas, so they are BTC. Only touches documents without `market`: idempotent.
 */
export async function migrateMarkets(cols: Collections): Promise<Record<string, number>> {
  const missing = { market: { $exists: false } }
  const fromRoundId = [
    {
      $set: {
        market: {
          $arrayElemAt: [MARKET_SYMBOLS, { $toInt: { $floor: { $divide: ['$roundId', MARKET_ROUND_BASE] } } }],
        },
      },
    },
  ]
  const [rounds, trades, points, closes, settlements, cheers] = await Promise.all([
    cols.rounds.updateMany(missing, fromRoundId),
    cols.trades.updateMany(missing, fromRoundId),
    cols.points.updateMany(missing, fromRoundId),
    cols.closes.updateMany(missing, fromRoundId),
    cols.settlements.updateMany(missing, fromRoundId),
    cols.cheers.updateMany(missing, { $set: { market: DEFAULT_MARKET } }),
  ])
  return {
    rounds: rounds.modifiedCount,
    trades: trades.modifiedCount,
    points: points.modifiedCount,
    closes: closes.modifiedCount,
    settlements: settlements.modifiedCount,
    cheers: cheers.modifiedCount,
  }
}

export async function ensureIndexes(cols: Collections): Promise<void> {
  await Promise.all([
    cols.users.createIndex({ wallet: 1 }, { unique: true }),
    cols.trades.createIndex({ id: 1 }, { unique: true }),
    cols.trades.createIndex({ roundId: 1, t: 1 }),
    cols.trades.createIndex({ market: 1, roundId: 1, t: 1 }),
    cols.rounds.createIndex({ roundId: 1 }, { unique: true }),
    cols.rounds.createIndex({ market: 1, roundId: -1 }),
    cols.points.createIndex({ roundId: 1, t: 1 }),
    cols.points.createIndex({ market: 1, roundId: 1, t: 1 }),
    cols.points.createIndex({ key: 1 }, { unique: true }),
    cols.closes.createIndex({ id: 1 }, { unique: true }),
    cols.closes.createIndex({ roundId: 1 }),
    cols.closes.createIndex({ market: 1, roundId: 1, t: 1 }),
    cols.settlements.createIndex({ id: 1 }, { unique: true }),
    cols.settlements.createIndex({ roundId: 1 }),
    cols.settlements.createIndex({ owner: 1 }),
    cols.settlements.createIndex({ market: 1, roundId: 1, t: 1 }),
    cols.settlements.createIndex({ market: 1, owner: 1, t: 1 }),
    cols.settlements.createIndex({ owner: 1, t: 1 }),
    cols.cheers.createIndex({ sig: 1 }, { unique: true }),
    cols.cheers.createIndex({ t: -1 }),
    cols.cheers.createIndex({ owner: 1, market: 1 }),
    cols.chat.createIndex({ t: 1 }),
    cols.chat.createIndex({ address: 1, t: -1 }),
    cols.faucet.createIndex({ wallet: 1, ts: 1 }),
    cols.faucet.createIndex({ ip: 1, ts: 1 }),
    cols.nonces.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    cols.nonces.createIndex({ wallet: 1 }),
    cols.sessions.createIndex({ token: 1 }, { unique: true }),
    cols.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    cols.prices.createIndex({ market: 1, t: 1 }, { unique: true }),
    cols.prices.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}
