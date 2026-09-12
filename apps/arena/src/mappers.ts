import { ROUND_RESOLVED } from './constants'
import type { CheersDto, CloseDto, Outcome, PointDto, RoundDto, SettlementDto, TradeDto } from './types'

// Decoded Anchor values: BN / bigint / number for integers, PublicKey for keys.
export type IntLike = { toString(): string }
export type KeyLike = { toBase58(): string }

export const MICRO_USD = 1_000_000
const BPS = 10_000

export const toNumber = (value: IntLike): number => Number(value.toString())
export const toUsd = (value: IntLike): number => toNumber(value) / MICRO_USD
export const eventId = (sig: string, index: number) => `${sig}:${index}`

export function outcomeOf(value: number): Outcome {
  if (value === 1) return 'YES'
  if (value === 2) return 'NO'
  throw new Error(`Unexpected outcome ${value}`)
}

export const roundOutcomeOf = (value: number): Outcome | null => (value === 1 || value === 2 ? outcomeOf(value) : null)

// Event payloads as decoded by `new EventParser(programId, new BorshCoder(idl))` (IDL field names).
export type TradeExecutedEvent = {
  round_id: IntLike
  owner: KeyLike
  outcome: number
  side: number
  amount: IntLike
  shares: IntLike
  fee: IntLike
  yes_price_bps: IntLike
  realized_pnl: IntLike
  ability: number
  balance: IntLike
  ts: IntLike
}
export type RoundOpenedEvent = {
  round_id: IntLike
  start_ts: IntLike
  end_ts: IntLike
  strike_price: IntLike
  price_expo: number
  liquidity: IntLike
}
export type RoundResolvedEvent = {
  round_id: IntLike
  strike_price: IntLike
  close_price: IntLike
  price_expo: number
  outcome: number
  yes_pool: IntLike
  no_pool: IntLike
  volume: IntLike
  trades: IntLike
  house_back: IntLike
  ts: IntLike
}
export type PositionSettledEvent = {
  round_id: IntLike
  owner: KeyLike
  outcome: number
  payout: IntLike
  profit: IntLike
  ability: number
  bonus: IntLike
  calm: boolean
  cheers: boolean
  balance: IntLike
  ts: IntLike
}
export type CheersPaidEvent = {
  owner: KeyLike
  recipients: KeyLike[]
  amount_each: IntLike
  randomness: ArrayLike<number>
  ts: IntLike
}
export type HeartReportedEvent = { owner: KeyLike; bpm: number; ts: IntLike }

export function yesPriceBps(yesPool: IntLike, noPool: IntLike): number {
  const yes = BigInt(yesPool.toString())
  const no = BigInt(noPool.toString())
  const total = yes + no
  // Mirrors programs/rogs-arena/src/math.rs yes_price_bps.
  return total === 0n ? BPS / 2 : Number((no * BigInt(BPS)) / total)
}

const pointFromBps = (roundId: number, bps: number, t: number): PointDto => ({
  roundId,
  t,
  yes: bps / BPS,
  no: (BPS - bps) / BPS,
  source: 'chain',
})

export const pointFromPools = (roundId: number, yesPool: IntLike, noPool: IntLike, t: number): PointDto =>
  pointFromBps(roundId, yesPriceBps(yesPool, noPool), t)

export function mapTrade(sig: string, index: number, event: TradeExecutedEvent) {
  const id = eventId(sig, index)
  const roundId = toNumber(event.round_id)
  const owner = event.owner.toBase58()
  const outcome = outcomeOf(event.outcome)
  const side = event.side === 1 ? 'SELL' : 'BUY'
  const amountRaw = toNumber(event.amount)
  const sharesRaw = toNumber(event.shares)
  const pnlRaw = side === 'SELL' ? toNumber(event.realized_pnl) : 0
  const bps = toNumber(event.yes_price_bps)
  const t = toNumber(event.ts) * 1000

  const trade: TradeDto = {
    id,
    sig,
    roundId,
    owner,
    side,
    outcome,
    amount: amountRaw / MICRO_USD,
    shares: sharesRaw / MICRO_USD,
    price: sharesRaw > 0 ? amountRaw / sharesRaw : 0,
    yesPrice: bps / BPS,
    fee: toUsd(event.fee),
    realizedPnl: pnlRaw / MICRO_USD,
    ability: event.ability,
    t,
  }
  const close: CloseDto | null =
    side === 'SELL'
      ? {
          id,
          roundId,
          trader: owner,
          outcome,
          exit: pnlRaw >= 0 ? 'tp' : 'sl',
          profit: pnlRaw / MICRO_USD,
          shares: sharesRaw / MICRO_USD,
          t,
        }
      : null
  return { trade, point: pointFromBps(roundId, bps, t), close }
}

export type RoundOpenedUpdate = Pick<RoundDto, 'roundId' | 'startTs' | 'endTs' | 'strikePrice' | 'priceExpo'> & {
  liquidity: number
  openedSig: string
}

export const mapRoundOpened = (sig: string, event: RoundOpenedEvent): RoundOpenedUpdate => ({
  roundId: toNumber(event.round_id),
  startTs: toNumber(event.start_ts),
  endTs: toNumber(event.end_ts),
  strikePrice: event.strike_price.toString(),
  priceExpo: event.price_expo,
  liquidity: toUsd(event.liquidity),
  openedSig: sig,
})

export type RoundResolvedUpdate = Omit<RoundDto, 'startTs' | 'endTs' | 'openedSig'> & { resolvedSig: string }

export const mapRoundResolved = (sig: string, event: RoundResolvedEvent): RoundResolvedUpdate => ({
  roundId: toNumber(event.round_id),
  strikePrice: event.strike_price.toString(),
  closePrice: event.close_price.toString(),
  priceExpo: event.price_expo,
  outcome: roundOutcomeOf(event.outcome),
  yesPool: toUsd(event.yes_pool),
  noPool: toUsd(event.no_pool),
  volume: toUsd(event.volume),
  trades: toNumber(event.trades),
  resolvedSig: sig,
})

export const mapSettlement = (sig: string, index: number, event: PositionSettledEvent): SettlementDto => ({
  id: eventId(sig, index),
  sig,
  roundId: toNumber(event.round_id),
  owner: event.owner.toBase58(),
  outcome: outcomeOf(event.outcome),
  payout: toUsd(event.payout),
  profit: toUsd(event.profit),
  ability: event.ability,
  bonus: toUsd(event.bonus),
  calm: event.calm,
  cheers: event.cheers,
  t: toNumber(event.ts) * 1000,
})

export const mapCheers = (sig: string, event: CheersPaidEvent): CheersDto => ({
  sig,
  owner: event.owner.toBase58(),
  recipients: event.recipients.map(key => key.toBase58()),
  amountEach: toUsd(event.amount_each),
  randomness: Buffer.from(Array.from(event.randomness)).toString('hex'),
  t: toNumber(event.ts) * 1000,
})

export const mapHeart = (event: HeartReportedEvent) => ({
  owner: event.owner.toBase58(),
  bpm: event.bpm,
  t: toNumber(event.ts) * 1000,
})

// Arena account structs as decoded by Program's camelCase coder.
export type ArenaRoundState = {
  id: IntLike
  startTs: IntLike
  endTs: IntLike
  strikePrice: IntLike
  closePrice: IntLike
  yesPool: IntLike
  noPool: IntLike
  volume: IntLike
  trades: IntLike
  priceExpo: number
  status: number
  outcome: number
}
export type ArenaRoundSummary = Omit<ArenaRoundState, 'status'>

export type ChainRound = Omit<RoundDto, 'openedSig' | 'resolvedSig'>

export function roundFromState(state: ArenaRoundState): ChainRound {
  const resolved = state.status === ROUND_RESOLVED
  return {
    roundId: toNumber(state.id),
    startTs: toNumber(state.startTs),
    endTs: toNumber(state.endTs),
    strikePrice: state.strikePrice.toString(),
    closePrice: resolved ? state.closePrice.toString() : null,
    priceExpo: state.priceExpo,
    outcome: resolved ? roundOutcomeOf(state.outcome) : null,
    yesPool: toUsd(state.yesPool),
    noPool: toUsd(state.noPool),
    volume: toUsd(state.volume),
    trades: toNumber(state.trades),
  }
}

export const roundFromSummary = (summary: ArenaRoundSummary): ChainRound => ({
  roundId: toNumber(summary.id),
  startTs: toNumber(summary.startTs),
  endTs: toNumber(summary.endTs),
  strikePrice: summary.strikePrice.toString(),
  closePrice: summary.closePrice.toString(),
  priceExpo: summary.priceExpo,
  outcome: roundOutcomeOf(summary.outcome),
  yesPool: toUsd(summary.yesPool),
  noPool: toUsd(summary.noPool),
  volume: toUsd(summary.volume),
  trades: toNumber(summary.trades),
})
