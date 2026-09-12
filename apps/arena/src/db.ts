import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb'
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
export type MetaDoc = {
  _id: string
  commits?: number
  lastCommitRound?: number
  lastCommitSig?: string
  lastCommitAt?: number
  settledThrough?: number
}
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
  }
}

export async function connectDb(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: 'rogs-arena' })
  await client.connect()
  const db = client.db(dbName)
  const keeperLogCapped = await ensureKeeperLog(db)
  const cols = getCollections(db)
  await ensureIndexes(cols)
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

export async function ensureIndexes(cols: Collections): Promise<void> {
  await Promise.all([
    cols.users.createIndex({ wallet: 1 }, { unique: true }),
    cols.trades.createIndex({ id: 1 }, { unique: true }),
    cols.trades.createIndex({ roundId: 1, t: 1 }),
    cols.rounds.createIndex({ roundId: 1 }, { unique: true }),
    cols.points.createIndex({ roundId: 1, t: 1 }),
    cols.points.createIndex({ key: 1 }, { unique: true }),
    cols.closes.createIndex({ id: 1 }, { unique: true }),
    cols.closes.createIndex({ roundId: 1 }),
    cols.settlements.createIndex({ id: 1 }, { unique: true }),
    cols.settlements.createIndex({ roundId: 1 }),
    cols.settlements.createIndex({ owner: 1 }),
    cols.cheers.createIndex({ sig: 1 }, { unique: true }),
    cols.chat.createIndex({ t: 1 }),
    cols.chat.createIndex({ address: 1, t: -1 }),
    cols.faucet.createIndex({ wallet: 1, ts: 1 }),
    cols.faucet.createIndex({ ip: 1, ts: 1 }),
    cols.nonces.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    cols.nonces.createIndex({ wallet: 1 }),
    cols.sessions.createIndex({ token: 1 }, { unique: true }),
    cols.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}
