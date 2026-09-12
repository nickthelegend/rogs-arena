import { PublicKey } from '@solana/web3.js'

import { arenaCoder } from './accounts'
import { PROGRAM_ID } from './constants'

type Raw = Record<string, any>
const big = (value: unknown) => BigInt((value as { toString(): string }).toString())
const num = (value: unknown) => Number((value as { toString(): string }).toString())

export type TradeExecuted = {
  roundId: number
  owner: PublicKey
  outcome: number
  side: number
  amount: bigint
  shares: bigint
  fee: bigint
  yesPriceBps: number
  realizedPnl: bigint
  ability: number
  balance: bigint
  ts: number
}
export type RoundOpened = { roundId: number; startTs: number; endTs: number; strikePrice: bigint; priceExpo: number; liquidity: bigint }
export type RoundResolved = {
  roundId: number
  strikePrice: bigint
  closePrice: bigint
  priceExpo: number
  outcome: number
  yesPool: bigint
  noPool: bigint
  volume: bigint
  trades: number
  houseBack: bigint
  ts: number
}
export type PositionSettled = {
  roundId: number
  owner: PublicKey
  outcome: number
  payout: bigint
  profit: bigint
  ability: number
  bonus: bigint
  calm: boolean
  cheers: boolean
  balance: bigint
  ts: number
}
export type ChipsClaimed = { owner: PublicKey; amount: bigint; first: boolean; balance: bigint; ts: number }
export type AbilityAttached = { roundId: number; owner: PublicKey; ability: number; ts: number }
export type HeartReported = { owner: PublicKey; bpm: number; ts: number }
export type CheersRequested = { owner: PublicKey; candidates: number; ts: number }
export type CheersPaid = { owner: PublicKey; recipients: PublicKey[]; amountEach: bigint; randomness: Uint8Array; ts: number }
export type CheersReset = { owner: PublicKey; ts: number }
export type ArenaPaused = { treasury: bigint; needed: bigint; ts: number }
export type TreasuryFunded = { amount: bigint; treasury: bigint; ts: number }

export type ArenaEvent =
  | { name: 'TradeExecuted'; data: TradeExecuted }
  | { name: 'RoundOpened'; data: RoundOpened }
  | { name: 'RoundResolved'; data: RoundResolved }
  | { name: 'PositionSettled'; data: PositionSettled }
  | { name: 'ChipsClaimed'; data: ChipsClaimed }
  | { name: 'AbilityAttached'; data: AbilityAttached }
  | { name: 'HeartReported'; data: HeartReported }
  | { name: 'CheersRequested'; data: CheersRequested }
  | { name: 'CheersPaid'; data: CheersPaid }
  | { name: 'CheersReset'; data: CheersReset }
  | { name: 'ArenaPaused'; data: ArenaPaused }
  | { name: 'TreasuryFunded'; data: TreasuryFunded }

function normalize(name: string, d: Raw): ArenaEvent | null {
  switch (name) {
    case 'TradeExecuted':
      return {
        name,
        data: {
          roundId: num(d.round_id),
          owner: d.owner,
          outcome: d.outcome,
          side: d.side,
          amount: big(d.amount),
          shares: big(d.shares),
          fee: big(d.fee),
          yesPriceBps: num(d.yes_price_bps),
          realizedPnl: big(d.realized_pnl),
          ability: d.ability,
          balance: big(d.balance),
          ts: num(d.ts),
        },
      }
    case 'RoundOpened':
      return {
        name,
        data: {
          roundId: num(d.round_id),
          startTs: num(d.start_ts),
          endTs: num(d.end_ts),
          strikePrice: big(d.strike_price),
          priceExpo: d.price_expo,
          liquidity: big(d.liquidity),
        },
      }
    case 'RoundResolved':
      return {
        name,
        data: {
          roundId: num(d.round_id),
          strikePrice: big(d.strike_price),
          closePrice: big(d.close_price),
          priceExpo: d.price_expo,
          outcome: d.outcome,
          yesPool: big(d.yes_pool),
          noPool: big(d.no_pool),
          volume: big(d.volume),
          trades: num(d.trades),
          houseBack: big(d.house_back),
          ts: num(d.ts),
        },
      }
    case 'PositionSettled':
      return {
        name,
        data: {
          roundId: num(d.round_id),
          owner: d.owner,
          outcome: d.outcome,
          payout: big(d.payout),
          profit: big(d.profit),
          ability: d.ability,
          bonus: big(d.bonus),
          calm: d.calm,
          cheers: d.cheers,
          balance: big(d.balance),
          ts: num(d.ts),
        },
      }
    case 'ChipsClaimed':
      return { name, data: { owner: d.owner, amount: big(d.amount), first: d.first, balance: big(d.balance), ts: num(d.ts) } }
    case 'AbilityAttached':
      return { name, data: { roundId: num(d.round_id), owner: d.owner, ability: d.ability, ts: num(d.ts) } }
    case 'HeartReported':
      return { name, data: { owner: d.owner, bpm: d.bpm, ts: num(d.ts) } }
    case 'CheersRequested':
      return { name, data: { owner: d.owner, candidates: d.candidates, ts: num(d.ts) } }
    case 'CheersPaid':
      return {
        name,
        data: {
          owner: d.owner,
          recipients: d.recipients,
          amountEach: big(d.amount_each),
          randomness: Uint8Array.from(d.randomness),
          ts: num(d.ts),
        },
      }
    case 'CheersReset':
      return { name, data: { owner: d.owner, ts: num(d.ts) } }
    case 'ArenaPaused':
      return { name, data: { treasury: big(d.treasury), needed: big(d.needed), ts: num(d.ts) } }
    case 'TreasuryFunded':
      return { name, data: { amount: big(d.amount), treasury: big(d.treasury), ts: num(d.ts) } }
    default:
      return null
  }
}

const DATA_PREFIX = 'Program data: '

/**
 * Decodes every rogs_arena event in a transaction's logs, in emission order.
 *
 * Tracks the invoke stack itself instead of using Anchor's EventParser, which
 * drops events emitted around CPIs: the VRF callback runs this program at
 * depth 2 under the VRF program, and request_cheers logs its event right after
 * an inner VRF invocation.
 */
export function parseArenaEvents(logs: string[], programId: PublicKey = PROGRAM_ID): ArenaEvent[] {
  const target = programId.toBase58()
  const stack: string[] = []
  const events: ArenaEvent[] = []
  for (const line of logs) {
    const invoke = /^Program (\w+) invoke \[\d+\]$/.exec(line)
    if (invoke) {
      stack.push(invoke[1])
      continue
    }
    if (/^Program \w+ (success|failed)/.test(line)) {
      stack.pop()
      continue
    }
    if (!line.startsWith(DATA_PREFIX) || stack[stack.length - 1] !== target) continue
    const decoded = arenaCoder.events.decode(line.slice(DATA_PREFIX.length))
    if (!decoded) continue
    const normalized = normalize(decoded.name, decoded.data as Raw)
    if (normalized) events.push(normalized)
  }
  return events
}
