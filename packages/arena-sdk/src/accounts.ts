import { BorshCoder, type Idl } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

import {
  DELEGATION_PROGRAM_ID,
  marketById,
  OUTCOME_NO,
  OUTCOME_YES,
  PROGRAM_ID,
  ROUND_OPEN,
  ROUND_RESOLVED,
} from './constants'
import { yesProbability } from './math'
import { arenaPda, badgeRecordPda, playerPda } from './pda'
import idl from './idl/rogs_arena.json'

export const arenaCoder = new BorshCoder(idl as Idl)

type Raw = Record<string, any>

const toBig = (value: unknown) => BigInt((value as { toString(): string }).toString())
const toNum = (value: unknown) => Number((value as { toString(): string }).toString())

export type RoundState = {
  id: number
  startTs: number
  endTs: number
  strikePrice: bigint
  closePrice: bigint
  yesPool: bigint
  noPool: bigint
  collateral: bigint
  volume: bigint
  trades: number
  priceExpo: number
  status: number
  outcome: number
}

export type RoundSummary = Omit<RoundState, 'collateral' | 'status'>

export type ArenaState = {
  address: PublicKey
  /** Coin market id; see MARKETS. */
  market: number
  authority: PublicKey
  keeper: PublicKey
  oracleFeed: PublicKey
  roundSeconds: number
  liquidity: bigint
  feeBps: bigint
  treasury: bigint
  claimsOutstanding: bigint
  totalVolume: bigint
  totalTrades: number
  totalPlayers: number
  crankTaskId: bigint
  lastRollTs: number
  commits: number
  current: RoundState
  /** Resolved rounds, newest first. */
  history: RoundSummary[]
  recent: PublicKey[]
}

export type PositionState = {
  roundId: number
  yesShares: bigint
  noShares: bigint
  cost: bigint
  proceeds: bigint
  basisYes: bigint
  basisNo: bigint
  maxBpm: number
  heartSamples: number
  ability: number
  active: boolean
}

export type PlayerState = {
  address: PublicKey
  owner: PublicKey
  joined: boolean
  balance: bigint
  positions: PositionState[]
  tradesTotal: number
  winsTotal: number
  lossesTotal: number
  winStreak: number
  bestStreak: number
  sameSideStreak: number
  lastSide: number
  calmWins: number
  dayIndex: number
  dayTrades: number
  badges: number
  pnlTotal: bigint
  bonusTotal: bigint
  volumeTotal: bigint
  heartBpm: number
  heartTs: number
  cheersPending: number
  cheersInflight: number
  cheersRequestedTs: number
  cheersReceived: bigint
  lastFaucetTs: number
}

function round(raw: Raw): RoundState {
  return {
    id: toNum(raw.id),
    startTs: toNum(raw.start_ts),
    endTs: toNum(raw.end_ts),
    strikePrice: toBig(raw.strike_price),
    closePrice: toBig(raw.close_price),
    yesPool: toBig(raw.yes_pool),
    noPool: toBig(raw.no_pool),
    collateral: raw.collateral === undefined ? 0n : toBig(raw.collateral),
    volume: toBig(raw.volume),
    trades: toNum(raw.trades),
    priceExpo: raw.price_expo,
    status: raw.status ?? ROUND_RESOLVED,
    outcome: raw.outcome,
  }
}

export function decodeArena(address: PublicKey, data: Uint8Array): ArenaState {
  const raw = arenaCoder.accounts.decode('Arena', Buffer.from(data)) as Raw
  const history = (raw.history as Raw[])
    .map(round)
    .filter((summary) => summary.id > 0 && summary.outcome !== 0)
    .sort((left, right) => right.id - left.id)
    .map(({ collateral: _collateral, status: _status, ...summary }) => summary)
  return {
    address,
    market: raw.market ?? 0,
    authority: raw.authority,
    keeper: raw.keeper,
    oracleFeed: raw.oracle_feed,
    roundSeconds: toNum(raw.round_seconds),
    liquidity: toBig(raw.liquidity),
    feeBps: toBig(raw.fee_bps),
    treasury: toBig(raw.treasury),
    claimsOutstanding: toBig(raw.claims_outstanding),
    totalVolume: toBig(raw.total_volume),
    totalTrades: toNum(raw.total_trades),
    totalPlayers: toNum(raw.total_players),
    crankTaskId: toBig(raw.crank_task_id),
    lastRollTs: toNum(raw.last_roll_ts),
    commits: toNum(raw.commits),
    current: round(raw.current),
    history,
    recent: (raw.recent as PublicKey[]).filter((key) => !key.equals(PublicKey.default)),
  }
}

export function decodePlayer(address: PublicKey, data: Uint8Array): PlayerState {
  const raw = arenaCoder.accounts.decode('Player', Buffer.from(data)) as Raw
  return {
    address,
    owner: raw.owner,
    joined: raw.joined,
    balance: toBig(raw.balance),
    positions: (raw.positions as Raw[]).map((position) => ({
      roundId: toNum(position.round_id),
      yesShares: toBig(position.yes_shares),
      noShares: toBig(position.no_shares),
      cost: toBig(position.cost),
      proceeds: toBig(position.proceeds),
      basisYes: toBig(position.basis_yes),
      basisNo: toBig(position.basis_no),
      maxBpm: position.max_bpm,
      heartSamples: position.heart_samples,
      ability: position.ability,
      active: position.active,
    })),
    tradesTotal: raw.trades_total,
    winsTotal: raw.wins_total,
    lossesTotal: raw.losses_total,
    winStreak: raw.win_streak,
    bestStreak: raw.best_streak,
    sameSideStreak: raw.same_side_streak,
    lastSide: raw.last_side,
    calmWins: raw.calm_wins,
    dayIndex: toNum(raw.day_index),
    dayTrades: raw.day_trades,
    badges: raw.badges,
    pnlTotal: toBig(raw.pnl_total),
    bonusTotal: toBig(raw.bonus_total),
    volumeTotal: toBig(raw.volume_total),
    heartBpm: raw.heart_bpm,
    heartTs: toNum(raw.heart_ts),
    cheersPending: raw.cheers_pending,
    cheersInflight: raw.cheers_inflight,
    cheersRequestedTs: toNum(raw.cheers_requested_ts),
    cheersReceived: toBig(raw.cheers_received),
    lastFaucetTs: toNum(raw.last_faucet_ts),
  }
}

export async function fetchArena(er: Connection, programId: PublicKey = PROGRAM_ID, market = 0) {
  const address = arenaPda(programId, market)
  const account = await er.getAccountInfo(address, 'confirmed')
  if (!account) throw new Error('The arena account was not found on the ephemeral rollup')
  return decodeArena(address, account.data)
}

export async function fetchPlayer(connection: Connection, owner: PublicKey, programId: PublicKey = PROGRAM_ID) {
  const address = playerPda(owner, programId)
  const account = await connection.getAccountInfo(address, 'confirmed')
  if (!account || !account.owner.equals(programId)) return null
  return decodePlayer(address, account.data)
}

export type AccountLayer = 'missing' | 'base' | 'delegated'

/** Where an account currently lives, judged by its base-layer owner. */
export async function accountLayer(base: Connection, address: PublicKey, programId: PublicKey = PROGRAM_ID): Promise<AccountLayer> {
  const account = await base.getAccountInfo(address, 'confirmed')
  if (!account) return 'missing'
  if (account.owner.equals(DELEGATION_PROGRAM_ID)) return 'delegated'
  if (account.owner.equals(programId)) return 'base'
  throw new Error(`Unexpected owner ${account.owner.toBase58()} for ${address.toBase58()}`)
}

export function subscribeArena(
  er: Connection,
  onArena: (arena: ArenaState) => void,
  onError: (error: Error) => void,
  programId: PublicKey = PROGRAM_ID,
  market = 0,
) {
  const address = arenaPda(programId, market)
  let disposed = false
  fetchArena(er, programId, market)
    .then((arena) => !disposed && onArena(arena))
    .catch((error: unknown) => !disposed && onError(error instanceof Error ? error : new Error(String(error))))
  const id = er.onAccountChange(
    address,
    (account) => {
      if (disposed) return
      try {
        onArena(decodeArena(address, account.data))
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    },
    { commitment: 'confirmed' },
  )
  return () => {
    disposed = true
    void er.removeAccountChangeListener(id)
  }
}

export function subscribePlayer(
  er: Connection,
  owner: PublicKey,
  onPlayer: (player: PlayerState | null) => void,
  onError: (error: Error) => void,
  programId: PublicKey = PROGRAM_ID,
) {
  const address = playerPda(owner, programId)
  let disposed = false
  fetchPlayer(er, owner, programId)
    .then((player) => !disposed && onPlayer(player))
    .catch((error: unknown) => !disposed && onError(error instanceof Error ? error : new Error(String(error))))
  const id = er.onAccountChange(
    address,
    (account) => {
      if (disposed) return
      try {
        onPlayer(account.owner.equals(programId) ? decodePlayer(address, account.data) : null)
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    },
    { commitment: 'confirmed' },
  )
  return () => {
    disposed = true
    void er.removeAccountChangeListener(id)
  }
}

export function positionForRound(player: PlayerState | null, roundId: number) {
  return player?.positions.find((position) => position.active && position.roundId === roundId) ?? null
}

export function outcomeLabel(outcome: number): 'YES' | 'NO' | null {
  if (outcome === OUTCOME_YES) return 'YES'
  if (outcome === OUTCOME_NO) return 'NO'
  return null
}

export function marketQuestion(symbol: string) {
  return `${symbol} closes at or above its opening price`
}

export const MARKET_QUESTION = marketQuestion('BTC')

/** UI-facing market object that mirrors the fields rizz-club components read. */
export type ArenaMarket = {
  id: string
  /** Coin market id; see MARKETS. */
  market: number
  /** Coin ticker, e.g. SOL. */
  asset: string
  symbol: string
  quote: string
  active: boolean
  outcomes: { label: 'YES' | 'NO'; symbol: string }[]
  info: {
    marketId: string
    tradingStart: number
    expiry: number
    intervalSec: number
    question: string
    venueId: string
  }
  roundId: number
  status: number
  strikePrice: bigint
  priceExpo: number
  yesPool: bigint
  noPool: bigint
  yesPrice: number
  noPrice: number
  liquidity: bigint
  feeBps: bigint
}

export function toArenaMarket(arena: ArenaState, nowSeconds = Math.floor(Date.now() / 1000)): ArenaMarket | null {
  const current = arena.current
  if (current.status === 0) return null
  const asset = marketById(arena.market).symbol
  const symbol = `${asset}-5M-R${current.id}`
  const yesPrice = yesProbability(current.yesPool, current.noPool)
  return {
    id: String(current.id),
    market: arena.market,
    asset,
    symbol,
    quote: 'CHIPS',
    active: current.status === ROUND_OPEN && nowSeconds < current.endTs,
    outcomes: [
      { label: 'YES', symbol: `${symbol}#YES` },
      { label: 'NO', symbol: `${symbol}#NO` },
    ],
    info: {
      marketId: String(current.id),
      tradingStart: current.startTs,
      expiry: current.endTs,
      intervalSec: arena.roundSeconds,
      question: marketQuestion(asset),
      venueId: 'rogs-arena',
    },
    roundId: current.id,
    status: current.status,
    strikePrice: current.strikePrice,
    priceExpo: current.priceExpo,
    yesPool: current.yesPool,
    noPool: current.noPool,
    yesPrice,
    noPrice: 1 - yesPrice,
    liquidity: arena.liquidity,
    feeBps: arena.feeBps,
  }
}

export type BadgeRecordState = {
  address: PublicKey
  owner: PublicKey
  badges: number
  bestStreak: number
  calmWins: number
  tradesTotal: number
  winsTotal: number
  /** How many post-commit Magic Actions have merged into this record. */
  updates: number
  updatedTs: number
}

export function decodeBadgeRecord(address: PublicKey, data: Uint8Array): BadgeRecordState {
  const raw = arenaCoder.accounts.decode('BadgeRecord', Buffer.from(data)) as Raw
  return {
    address,
    owner: raw.owner,
    badges: raw.badges,
    bestStreak: raw.best_streak,
    calmWins: raw.calm_wins,
    tradesTotal: raw.trades_total,
    winsTotal: raw.wins_total,
    updates: raw.updates,
    updatedTs: toNum(raw.updated_ts),
  }
}

/** The owner's badge record on Solana; null until init_badge_record has run. */
export async function fetchBadgeRecord(base: Connection, owner: PublicKey, programId: PublicKey = PROGRAM_ID) {
  const address = badgeRecordPda(owner, programId)
  const account = await base.getAccountInfo(address, 'confirmed')
  if (!account || !account.owner.equals(programId)) return null
  return decodeBadgeRecord(address, account.data)
}

/**
 * Fair Cheers candidates: every distinct recent trader except the winner. The program rejects a
 * request_cheers that leaves any of them out.
 */
export function fairCheersCandidates(arena: Pick<ArenaState, 'recent'>, winner: PublicKey): PublicKey[] {
  const seen = new Set<string>()
  return arena.recent.filter((owner) => {
    const id = owner.toBase58()
    if (owner.equals(PublicKey.default) || owner.equals(winner) || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
