import type { Collection, Document, Filter, UpdateFilter } from 'mongodb'
import type { Collections, UserDoc } from './db'
import { isDuplicateKey } from './errors'
import type { ChainRound, RoundOpenedUpdate, RoundResolvedUpdate } from './mappers'
import type { CheersDto, CloseDto, PointDto, ProfileDto, RoundDto, SettlementDto, TradeDto } from './types'

const hidden = { projection: { _id: 0, key: 0 } }

/** Inserts `doc` only if nothing matches `filter`. Returns true when this call inserted it. */
async function insertOnce<T extends Document>(collection: Collection<T>, filter: Filter<T>, doc: T): Promise<boolean> {
  try {
    const result = await collection.updateOne(filter, { $setOnInsert: doc } as UpdateFilter<T>, { upsert: true })
    return result.upsertedCount === 1
  } catch (error) {
    if (isDuplicateKey(error)) return false
    throw error
  }
}

export const saveTrade = (cols: Collections, trade: TradeDto) => insertOnce(cols.trades, { id: trade.id }, trade)
export const saveClose = (cols: Collections, close: CloseDto) => insertOnce(cols.closes, { id: close.id }, close)
export const saveSettlement = (cols: Collections, settlement: SettlementDto) =>
  insertOnce(cols.settlements, { id: settlement.id }, settlement)

/** Inserts a cheers once. A copy saved without a market (its transaction was unreadable) gets it from a later pass. */
export async function saveCheers(cols: Collections, cheers: CheersDto): Promise<boolean> {
  if (await insertOnce(cols.cheers, { sig: cheers.sig }, cheers)) return true
  if (cheers.market !== null) await cols.cheers.updateOne({ sig: cheers.sig, market: null }, { $set: { market: cheers.market } })
  return false
}
export const savePoint = (cols: Collections, key: string, point: PointDto) =>
  insertOnce(cols.points, { key }, { ...point, key })

async function upsertRound(cols: Collections, filter: Filter<RoundDto>, update: UpdateFilter<RoundDto>) {
  try {
    const result = await cols.rounds.updateOne(filter, update, { upsert: true })
    return result.upsertedCount + result.modifiedCount > 0
  } catch (error) {
    // A filtered upsert that misses an existing roundId collides on the unique index: nothing to do.
    if (isDuplicateKey(error)) return false
    throw error
  }
}

// Each writer only $sets the fields its source knows, so events and account reads can arrive in any order.
export async function applyRoundOpened(cols: Collections, update: RoundOpenedUpdate): Promise<RoundDto | null> {
  const { market, roundId, startTs, endTs, strikePrice, priceExpo, openedSig, liquidity } = update
  await upsertRound(
    cols,
    { roundId },
    {
      $set: { market, startTs, endTs, strikePrice, priceExpo, openedSig },
      $setOnInsert: {
        closePrice: null,
        outcome: null,
        yesPool: liquidity,
        noPool: liquidity,
        volume: 0,
        trades: 0,
        resolvedSig: null,
      },
    },
  )
  return getRound(cols, roundId)
}

export async function applyRoundResolved(cols: Collections, update: RoundResolvedUpdate): Promise<RoundDto | null> {
  const { roundId, ...fields } = update
  await upsertRound(cols, { roundId }, { $set: fields, $setOnInsert: { startTs: 0, endTs: 0, openedSig: null } })
  return getRound(cols, roundId)
}

/** Writes round state read from the Arena account. Open rounds never overwrite a resolved record. */
export async function syncRoundFromChain(cols: Collections, round: ChainRound): Promise<boolean> {
  const { roundId, closePrice, outcome, ...live } = round
  if (outcome === null) {
    return upsertRound(
      cols,
      { roundId, outcome: null },
      { $set: live, $setOnInsert: { closePrice: null, openedSig: null, resolvedSig: null } },
    )
  }
  return upsertRound(
    cols,
    { roundId },
    { $set: { ...live, closePrice, outcome }, $setOnInsert: { openedSig: null, resolvedSig: null } },
  )
}

export async function getRound(cols: Collections, roundId: number): Promise<RoundDto | null> {
  return (await cols.rounds.findOne({ roundId }, hidden)) as RoundDto | null
}

/** The market's newest round: the one in progress, or the last one if the arena is paused. */
export async function latestRound(cols: Collections, market: string): Promise<RoundDto | null> {
  return (await cols.rounds.findOne({ market }, { ...hidden, sort: { roundId: -1 } })) as RoundDto | null
}

export async function listRounds(cols: Collections, market: string, limit: number): Promise<RoundDto[]> {
  return (await cols.rounds.find({ market }, hidden).sort({ roundId: -1 }).limit(limit).toArray()) as RoundDto[]
}

// Round ids are unique across markets; `market` is still part of each query so a round id from another
// market returns nothing and the per-market indexes are used.

/** The newest `limit` trades of a round, returned in ascending time order. */
export async function listTrades(cols: Collections, market: string, roundId: number, limit = 5_000): Promise<TradeDto[]> {
  const docs = await cols.trades.find({ market, roundId }, hidden).sort({ t: -1, id: -1 }).limit(limit).toArray()
  return docs.reverse() as TradeDto[]
}

export async function listPoints(cols: Collections, market: string, roundId: number, limit = 5_000): Promise<PointDto[]> {
  const docs = await cols.points.find({ market, roundId }, hidden).sort({ t: -1 }).limit(limit).toArray()
  return docs.reverse() as PointDto[]
}

export async function listCloses(cols: Collections, market: string, roundId: number): Promise<CloseDto[]> {
  return (await cols.closes.find({ market, roundId }, hidden).sort({ t: 1, id: 1 }).limit(5_000).toArray()) as CloseDto[]
}

/** Settlement filters; no `market` means every market (only an owner-only query asks for that). */
export type SettlementScope = { market?: string; roundId?: number; owner?: string }

export async function listSettlements(cols: Collections, filter: SettlementScope): Promise<SettlementDto[]> {
  const query: Filter<SettlementDto> = {}
  if (filter.market !== undefined) query.market = filter.market
  if (filter.roundId !== undefined) query.roundId = filter.roundId
  if (filter.owner !== undefined) query.owner = filter.owner
  return (await cols.settlements.find(query, hidden).sort({ t: 1, id: 1 }).limit(1_000).toArray()) as SettlementDto[]
}

export async function listCheers(cols: Collections, limit: number): Promise<CheersDto[]> {
  return (await cols.cheers.find({}, hidden).sort({ t: -1 }).limit(limit).toArray()) as CheersDto[]
}

export async function getUser(cols: Collections, wallet: string): Promise<UserDoc | null> {
  return cols.users.findOne({ wallet }, { projection: { _id: 0 } })
}

export const toProfile = (user: UserDoc): ProfileDto => ({
  wallet: user.wallet,
  displayName: user.displayName,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

export async function upsertProfile(cols: Collections, wallet: string, displayName: string, now = Date.now()) {
  const user = await cols.users.findOneAndUpdate(
    { wallet },
    { $set: { displayName, updatedAt: now }, $setOnInsert: { wallet, isBot: false, createdAt: now } },
    { upsert: true, returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!user) throw new Error('Profile upsert returned no document')
  return user
}
