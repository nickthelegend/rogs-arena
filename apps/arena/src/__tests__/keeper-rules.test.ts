import { describe, expect, test } from 'bun:test'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { MAX_CHEERS_CANDIDATES, ROUND_IDLE, ROUND_OPEN, ROUND_RESOLVED } from '../constants'
import { MARKET_ROUND_BASE, crankTaskId as sdkCrankTaskId } from '@rogs/arena-sdk'
import { env } from '../env'
import {
  cheersCandidateOwners,
  settledIn,
  cheersMarket,
  crankStalled,
  crankTaskId,
  crankTaskLabel,
  keeperMetaId,
  latestResolvedRoundNumber,
  resolvedRoundsAfter,
  rollReason,
  shouldCommit,
  shouldRescheduleCrank,
  type RollInput,
} from '../keeper'
import { buildMarkets } from '../markets'

const base: RollInput = {
  status: ROUND_OPEN,
  endTs: 1_000,
  lastRollTs: 700,
  treasury: 1_000_000_000n,
  liquidity: 200_000_000n,
  now: 999,
}

describe('keeper decisions', () => {
  test('the watchdog only rolls an open round 8 s after end_ts', () => {
    expect(rollReason({ ...base, now: 1_007 })).toBeNull()
    expect(rollReason({ ...base, now: 1_008 })).toBe('crank late: round ended 8s ago')
  })

  test('idle or paused arenas open a round once treasury covers liquidity', () => {
    expect(rollReason({ ...base, status: ROUND_IDLE })).toBe('arena idle with enough treasury to open a round')
    expect(rollReason({ ...base, status: ROUND_RESOLVED })).toBe('arena paused but treasury now covers liquidity')
    expect(rollReason({ ...base, status: ROUND_RESOLVED, treasury: 199_999_999n })).toBeNull()
  })

  test('the crank is flagged as stalled 20 s past end_ts without a roll', () => {
    expect(crankStalled({ ...base, now: 1_019 })).toBe(false)
    expect(crankStalled({ ...base, now: 1_020 })).toBe(true)
    expect(crankStalled({ ...base, now: 1_020, lastRollTs: 1_001 })).toBe(false)
  })

  test('a fresh crank task is scheduled after 2 consecutive stalled rounds', () => {
    expect(shouldRescheduleCrank(0)).toBe(false)
    expect(shouldRescheduleCrank(1)).toBe(false)
    expect(shouldRescheduleCrank(2)).toBe(true)
  })

  test('crank task ids match the SDK derivation used at bootstrap', async () => {
    const label = 'rogs-arena:rounds:ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ'
    expect(await crankTaskId(label)).toBe(await sdkCrankTaskId(label))
    expect(await crankTaskId(`${label}:r42`)).not.toBe(await crankTaskId(label))
    expect(await crankTaskId(label)).toBeLessThan(2n ** 56n)
  })

  test('commits every 12 resolved rounds, at most 9 times', () => {
    expect(shouldCommit(11, 0, 0)).toBe(false)
    expect(shouldCommit(12, 0, 0)).toBe(true)
    expect(shouldCommit(23, 12, 1)).toBe(false)
    expect(shouldCommit(24, 12, 1)).toBe(true)
    expect(shouldCommit(500, 12, 9)).toBe(false)
  })
})

describe('settle confirmation', () => {
  test('only a PositionSettled for the same owner and round counts as a settlement', () => {
    const owner = PublicKey.unique()
    const settled = (roundId: number, key: PublicKey) => ({ name: 'PositionSettled', index: 0, data: { round_id: new BN(roundId), owner: key } })
    expect(settledIn([settled(5, owner)], owner, 5)).toBe(true)
    expect(settledIn([], owner, 5)).toBe(false)
    expect(settledIn([settled(6, owner)], owner, 5)).toBe(false)
    expect(settledIn([settled(5, PublicKey.unique())], owner, 5)).toBe(false)
    expect(settledIn([{ name: 'TradeExecuted', index: 0, data: {} }], owner, 5)).toBe(false)
  })
})

describe('fair cheers candidates', () => {
  test('every distinct recent trader except the winner, skipping empty slots and duplicates', () => {
    const [a, b, winner] = [PublicKey.unique(), PublicKey.unique(), PublicKey.unique()]
    const recent = [a, PublicKey.default, winner, b, a, PublicKey.default]
    expect(cheersCandidateOwners(recent, winner).map(key => key.toBase58())).toEqual([a.toBase58(), b.toBase58()])
    expect(cheersCandidateOwners([], winner)).toEqual([])
  })

  test('a full ring of 16 recent traders yields 15 candidates, the program cap', () => {
    const recent = Array.from({ length: 16 }, () => PublicKey.unique())
    expect(cheersCandidateOwners(recent, recent[3]).length).toBe(MAX_CHEERS_CANDIDATES)
  })
})

describe('per-market keeper decisions', () => {
  const eth = (n: number) => MARKET_ROUND_BASE + n
  const markets = buildMarkets(new PublicKey(env.PROGRAM_ID), new PublicKey(env.ORACLE_BTC_FEED))

  test('keeper meta: BTC keeps its pre-multi-market document, every other market has its own', () => {
    expect(keeperMetaId('BTC')).toBe('keeper')
    expect(keeperMetaId('ETH')).toBe('keeper:ETH')
    expect(new Set(markets.map(market => keeperMetaId(market.symbol))).size).toBe(9)
  })

  test('settling walks one arena history with namespaced ids, oldest first', () => {
    const history = [
      { id: new BN(eth(3)), outcome: 1 },
      { id: new BN(eth(1)), outcome: 2 },
      { id: new BN(eth(4)), outcome: 0 },
      { id: new BN(0), outcome: 0 },
    ]
    expect(resolvedRoundsAfter(history, 0)).toEqual([eth(1), eth(3)])
    expect(resolvedRoundsAfter(history, eth(1))).toEqual([eth(3)])
    expect(resolvedRoundsAfter(history, eth(3))).toEqual([])
    // BTC ids are their own round numbers, so its stored progress keeps working.
    expect(resolvedRoundsAfter([{ id: new BN(63), outcome: 1 }, { id: new BN(62), outcome: 2 }], 62)).toEqual([63])
  })

  test('commit cadence counts round numbers, so a new market does not commit on its first resolved round', () => {
    const early = [{ id: new BN(eth(1)), outcome: 1 }, { id: new BN(eth(2)), outcome: 0 }]
    expect(latestResolvedRoundNumber(early)).toBe(1)
    expect(shouldCommit(latestResolvedRoundNumber(early), 0, 0)).toBe(false)
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: new BN(eth(i + 1)), outcome: 1 }))
    expect(latestResolvedRoundNumber(twelve)).toBe(12)
    expect(shouldCommit(latestResolvedRoundNumber(twelve), 0, 0)).toBe(true)
    expect(latestResolvedRoundNumber([{ id: new BN(0), outcome: 0 }])).toBe(0)
  })

  test('markets in different states get independent roll decisions', () => {
    const btc: RollInput = { ...base, now: 999 }
    const sol: RollInput = { ...base, status: ROUND_IDLE, endTs: 0, lastRollTs: 0 }
    expect(rollReason(btc)).toBeNull()
    expect(rollReason(sol)).toBe('arena idle with enough treasury to open a round')
  })

  test('crank reschedule labels extend each arena\'s bootstrap label and give distinct task ids', async () => {
    const ids = new Set<bigint>()
    for (const market of markets) {
      const arena = market.arena.toBase58()
      const bootstrap = `rogs-arena:rounds:${arena}`
      expect(crankTaskLabel(arena, 42)).toBe(`${bootstrap}:r42`)
      expect(await crankTaskId(bootstrap)).toBe(await sdkCrankTaskId(bootstrap))
      ids.add(await crankTaskId(crankTaskLabel(arena, 42)))
    }
    expect(ids.size).toBe(9)
  })

  test('cheers are requested on the market they were won in', () => {
    expect(cheersMarket([], [])).toBeNull()
    expect(cheersMarket([{ market: 'SOL', t: 1 }], [])).toBe('SOL')
    // Oldest unpaid win first, regardless of input order.
    expect(cheersMarket([{ market: 'ETH', t: 2 }, { market: 'BTC', t: 1 }], [])).toBe('BTC')
    // A BTC cheers was already paid, so the pending one is the ETH win.
    expect(cheersMarket([{ market: 'BTC', t: 1 }, { market: 'ETH', t: 2 }], [{ market: 'BTC' }])).toBe('ETH')
    // Paid cheers only cancel wins from their own market.
    expect(cheersMarket([{ market: 'BTC', t: 1 }, { market: 'ETH', t: 2 }], [{ market: 'ETH' }])).toBe('BTC')
    // Paid cheers without a known market cancel nothing.
    expect(cheersMarket([{ market: 'XRP', t: 4 }], [{ market: null }])).toBe('XRP')
    // Everything looks paid (an indexing gap): the newest win decides.
    expect(cheersMarket([{ market: 'BTC', t: 1 }, { market: 'SOL', t: 5 }], [{ market: 'BTC' }, { market: 'SOL' }])).toBe('SOL')
  })
})
