import { describe, expect, test } from 'bun:test'
import { ROUND_IDLE, ROUND_OPEN, ROUND_RESOLVED } from '../constants'
import { crankTaskId as sdkCrankTaskId } from '@rogs/arena-sdk'
import { crankStalled, crankTaskId, rollReason, shouldCommit, shouldRescheduleCrank, type RollInput } from '../keeper'

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
