import type {
  ArenaSnapshot,
  ChatDto,
  CheersDto,
  CloseDto,
  PointDto,
  RoundDto,
  SettlementDto,
  TradeDto,
  TraderDto,
} from '@/lib/arena-api'
import { DEFAULT_MARKET, dtoMarket, isInMarket, marketSymbolOfRound, type MarketSymbol } from '@/lib/markets'
import { createStore } from 'zustand/vanilla'

export const CHAT_KEEP = 50
export const RECENT_ROUNDS_KEEP = 96
export const ROUND_DATA_KEEP = 4
export const SETTLEMENTS_KEEP = 100
export const CHEERS_KEEP = 20

export type ArenaServerMessage =
  | { type: 'snapshot'; data: ArenaSnapshot }
  | { type: 'traders'; traders: TraderDto[]; anonymous: number; online: number }
  | { type: 'chat'; message: ChatDto }
  | { type: 'trade'; trade: TradeDto }
  | { type: 'point'; point: PointDto }
  | { type: 'round'; round: RoundDto }
  | { type: 'close'; close: CloseDto }
  | { type: 'settlement'; settlement: SettlementDto }
  | { type: 'cheers'; cheers: CheersDto }
  | { type: 'error'; error: string }

export type ArenaConnection = 'idle' | 'connecting' | 'open' | 'reconnecting'
export type SnapshotStatus = 'loading' | 'ready' | 'error'
export type RoundDataKind = 'trades' | 'points' | 'closes'
export type RoundLoad = { status: 'loading' | 'ready' | 'error'; error: string | null }
export type RoundDataStatus = 'loading' | 'live' | 'error'

export type RoundDataPayload =
  | { kind: 'trades'; roundId: number; items: TradeDto[] }
  | { kind: 'points'; roundId: number; items: PointDto[] }
  | { kind: 'closes'; roundId: number; items: CloseDto[] }

export type ArenaRealtimeState = {
  connection: ArenaConnection
  connectionError: string | null
  snapshotStatus: SnapshotStatus
  snapshotError: string | null
  snapshotServerTime: number | null
  serverError: string | null
  serverTimeOffsetMs: number
  /** The coin `round`, `rounds`, `trades`, `points`, `closes` and `loads` belong to. Everything else is global. */
  market: MarketSymbol
  round: RoundDto | null
  rounds: RoundDto[]
  traders: TraderDto[]
  anonymous: number
  online: number
  chat: ChatDto[]
  trades: Record<number, TradeDto[]>
  points: Record<number, PointDto[]>
  closes: Record<number, CloseDto[]>
  loads: Record<string, RoundLoad>
  /** Every coin's settlements: a result in another market still matters to the wallet that holds it. */
  settlements: SettlementDto[]
  cheers: CheersDto[]
}

const roundKinds: RoundDataKind[] = ['trades', 'points', 'closes']
const readyLoad: RoundLoad = { status: 'ready', error: null }
const serverMessageTypes = new Set<ArenaServerMessage['type']>([
  'snapshot',
  'traders',
  'chat',
  'trade',
  'point',
  'round',
  'close',
  'settlement',
  'cheers',
  'error',
])

export function initialArenaRealtimeState(): ArenaRealtimeState {
  return {
    connection: 'idle',
    connectionError: null,
    snapshotStatus: 'loading',
    snapshotError: null,
    snapshotServerTime: null,
    serverError: null,
    serverTimeOffsetMs: 0,
    market: DEFAULT_MARKET,
    round: null,
    rounds: [],
    traders: [],
    anonymous: 0,
    online: 0,
    chat: [],
    trades: {},
    points: {},
    closes: {},
    loads: {},
    settlements: [],
    cheers: [],
  }
}

export function createArenaRealtimeStore() {
  return createStore<ArenaRealtimeState>()(() => initialArenaRealtimeState())
}

export function loadKey(kind: RoundDataKind, roundId: number) {
  return `${kind}:${roundId}`
}

export function parseServerMessage(value: unknown): ArenaServerMessage | null {
  if (!value || typeof value !== 'object') return null
  const type = (value as { type?: unknown }).type
  if (typeof type !== 'string' || !serverMessageTypes.has(type as ArenaServerMessage['type'])) return null
  return value as ArenaServerMessage
}

export function roundIdsFromMarketIds(marketIds: readonly string[]) {
  const ids = new Set<number>()
  for (const id of marketIds) {
    if (!/^\d+$/.test(id)) continue
    const roundId = Number(id)
    if (Number.isSafeInteger(roundId)) ids.add(roundId)
  }
  return [...ids].sort((left, right) => left - right)
}

export function roundDataStatus(
  loads: Readonly<Record<string, RoundLoad>>,
  kind: RoundDataKind,
  roundIds: readonly number[],
): RoundDataStatus {
  let ready = true
  for (const roundId of roundIds) {
    const load = loads[loadKey(kind, roundId)]
    if (load?.status === 'error') return 'error'
    if (load?.status !== 'ready') ready = false
  }
  return ready ? 'live' : 'loading'
}

export function roundDataError(
  loads: Readonly<Record<string, RoundLoad>>,
  kind: RoundDataKind,
  roundIds: readonly number[],
) {
  for (const roundId of roundIds) {
    const load = loads[loadKey(kind, roundId)]
    if (load?.status === 'error') return load.error
  }
  return null
}

/** A row counts for `market` when its ticker (missing means BTC) and its namespaced round id both say so. */
export function belongsToMarket(item: { market?: string; roundId: number }, market: MarketSymbol) {
  return isInMarket(item, market) && marketSymbolOfRound(item.roundId) === market
}

/** Switches the coin round data is kept for. Chat, traders, cheers and settlements are global and stay. */
export function selectArenaMarket(state: ArenaRealtimeState, market: MarketSymbol): ArenaRealtimeState {
  if (state.market === market) return state
  return { ...state, market, round: null, rounds: [], trades: {}, points: {}, closes: {}, loads: {} }
}

function mergeBy<T>(
  current: readonly T[] | undefined,
  incoming: readonly T[],
  key: (item: T) => string,
  compare: (left: T, right: T) => number,
): T[] {
  if (incoming.length === 0) return current ? (current as T[]) : []

  const byKey = new Map<string, T>()
  for (const item of current ?? []) byKey.set(key(item), item)
  for (const item of incoming) byKey.set(key(item), item)
  return [...byKey.values()].sort(compare)
}

function compareTimed(left: { id: string; t: number }, right: { id: string; t: number }) {
  return left.t - right.t || left.id.localeCompare(right.id)
}

function mergeTimed<T extends { id: string; t: number }>(current: readonly T[] | undefined, incoming: readonly T[]) {
  return mergeBy(current, incoming, (item) => item.id, compareTimed)
}

function mergePoints(current: readonly PointDto[] | undefined, incoming: readonly PointDto[]) {
  return mergeBy(
    current,
    incoming,
    (point) => String(point.t),
    (left, right) => left.t - right.t,
  )
}

function mergeCheers(current: readonly CheersDto[], incoming: readonly CheersDto[]) {
  return mergeBy(
    current,
    incoming,
    (cheers) => cheers.sig,
    (left, right) => right.t - left.t || left.sig.localeCompare(right.sig),
  ).slice(0, CHEERS_KEEP)
}

export function upsertRound(rounds: readonly RoundDto[], round: RoundDto) {
  const next = rounds.filter((item) => item.roundId !== round.roundId)
  next.push(round)
  next.sort((left, right) => right.roundId - left.roundId)
  return next.slice(0, RECENT_ROUNDS_KEEP)
}

function groupByRound<T extends { roundId: number }>(items: readonly T[]) {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const group = groups.get(item.roundId)
    if (group) group.push(item)
    else groups.set(item.roundId, [item])
  }
  return groups
}

function pruneRoundRecord<T>(record: Record<number, T>, minRoundId: number): Record<number, T> {
  let changed = false
  const next: Record<number, T> = {}
  for (const [key, value] of Object.entries(record)) {
    if (Number(key) >= minRoundId) next[Number(key)] = value
    else changed = true
  }
  return changed ? next : record
}

function pruneLoads(loads: Record<string, RoundLoad>, minRoundId: number) {
  let changed = false
  const next: Record<string, RoundLoad> = {}
  for (const [key, load] of Object.entries(loads)) {
    const roundId = Number(key.slice(key.indexOf(':') + 1))
    if (roundId >= minRoundId) next[key] = load
    else changed = true
  }
  return changed ? next : loads
}

export function applySnapshot(state: ArenaRealtimeState, snapshot: ArenaSnapshot, receivedAt: number): ArenaRealtimeState {
  if (state.snapshotServerTime != null && snapshot.serverTime < state.snapshotServerTime) return state

  const withGlobals: ArenaRealtimeState = {
    ...state,
    snapshotStatus: 'ready',
    snapshotError: null,
    snapshotServerTime: snapshot.serverTime,
    serverTimeOffsetMs: snapshot.serverTime - receivedAt,
    traders: snapshot.traders,
    anonymous: snapshot.anonymous,
    online: snapshot.online,
    chat: mergeTimed(state.chat, snapshot.chat).slice(-CHAT_KEEP),
    cheers: mergeCheers(state.cheers, snapshot.cheers),
  }

  // Another coin's snapshot (a reply that lost a race with a coin switch, or the single-market service's BTC one)
  // brings chat, traders and cheers, but leaves this coin's rounds alone.
  const market = state.market
  if (dtoMarket(snapshot) !== market) return withGlobals

  const own = <T extends { market?: string; roundId: number }>(items: readonly T[]) =>
    items.filter((item) => belongsToMarket(item, market))

  let trades = state.trades
  let points = state.points
  let closes = state.closes
  for (const [roundId, items] of groupByRound(own(snapshot.trades))) {
    trades = { ...trades, [roundId]: mergeTimed(trades[roundId], items) }
  }
  for (const [roundId, items] of groupByRound(own(snapshot.points))) {
    points = { ...points, [roundId]: mergePoints(points[roundId], items) }
  }
  for (const [roundId, items] of groupByRound(own(snapshot.closes))) {
    closes = { ...closes, [roundId]: mergeTimed(closes[roundId], items) }
  }

  // Anything not delivered by this snapshot is refetched on demand; in-flight fetches are left to finish.
  const loads: Record<string, RoundLoad> = {}
  for (const [key, load] of Object.entries(state.loads)) {
    if (load.status === 'loading') loads[key] = load
  }

  const round = snapshot.round && belongsToMarket(snapshot.round, market) ? snapshot.round : null
  const recentRounds = own(snapshot.recentRounds)
  if (round) {
    for (const kind of roundKinds) loads[loadKey(kind, round.roundId)] = readyLoad
    const minRoundId = round.roundId - ROUND_DATA_KEEP + 1
    trades = pruneRoundRecord(trades, minRoundId)
    points = pruneRoundRecord(points, minRoundId)
    closes = pruneRoundRecord(closes, minRoundId)
  }

  return {
    ...withGlobals,
    round,
    rounds: round ? upsertRound(recentRounds, round) : recentRounds.slice(0, RECENT_ROUNDS_KEEP),
    trades,
    points,
    closes,
    loads: round ? pruneLoads(loads, round.roundId - ROUND_DATA_KEEP + 1) : loads,
  }
}

export function applyRoundData(state: ArenaRealtimeState, payload: RoundDataPayload): ArenaRealtimeState {
  const { roundId } = payload
  if (marketSymbolOfRound(roundId) !== state.market) return state
  const own = <T extends { market?: string; roundId: number }>(items: readonly T[]) =>
    items.filter((item) => item.roundId === roundId && belongsToMarket(item, state.market))

  switch (payload.kind) {
    case 'trades':
      return { ...state, trades: { ...state.trades, [roundId]: mergeTimed(state.trades[roundId], own(payload.items)) } }
    case 'points':
      return { ...state, points: { ...state.points, [roundId]: mergePoints(state.points[roundId], own(payload.items)) } }
    case 'closes':
      return { ...state, closes: { ...state.closes, [roundId]: mergeTimed(state.closes[roundId], own(payload.items)) } }
  }
}

function applyRound(state: ArenaRealtimeState, round: RoundDto): ArenaRealtimeState {
  if (!belongsToMarket(round, state.market)) return state
  const rounds = upsertRound(state.rounds, round)
  if (state.round && round.roundId < state.round.roundId) return { ...state, rounds }

  const minRoundId = round.roundId - ROUND_DATA_KEEP + 1
  return {
    ...state,
    rounds,
    round,
    trades: pruneRoundRecord(state.trades, minRoundId),
    points: pruneRoundRecord(state.points, minRoundId),
    closes: pruneRoundRecord(state.closes, minRoundId),
    loads: pruneLoads(state.loads, minRoundId),
  }
}

export function applyServerMessage(
  state: ArenaRealtimeState,
  message: ArenaServerMessage,
  receivedAt: number,
): ArenaRealtimeState {
  switch (message.type) {
    case 'snapshot':
      return applySnapshot(state, message.data, receivedAt)
    case 'traders':
      return { ...state, traders: message.traders, anonymous: message.anonymous, online: message.online }
    case 'chat':
      return { ...state, chat: mergeTimed(state.chat, [message.message]).slice(-CHAT_KEEP) }
    // Trades, points, closes and rounds are broadcast for every coin; only the selected coin's are kept.
    case 'trade':
      return applyRoundData(state, { kind: 'trades', roundId: message.trade.roundId, items: [message.trade] })
    case 'point':
      return applyRoundData(state, { kind: 'points', roundId: message.point.roundId, items: [message.point] })
    case 'close':
      return applyRoundData(state, { kind: 'closes', roundId: message.close.roundId, items: [message.close] })
    case 'round':
      return applyRound(state, message.round)
    case 'settlement':
      return {
        ...state,
        settlements: [
          message.settlement,
          ...state.settlements.filter((settlement) => settlement.id !== message.settlement.id),
        ].slice(0, SETTLEMENTS_KEEP),
      }
    case 'cheers':
      return { ...state, cheers: mergeCheers(state.cheers, [message.cheers]) }
    case 'error':
      return { ...state, serverError: message.error }
  }
}
