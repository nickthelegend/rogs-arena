import { describe, expect, test } from 'bun:test'
import {
  emptyProgressState,
  isCalmHeartRate,
  progressFromPlayer,
  progressHeartRateBpm,
  progressTracks,
  STEAL_HEART_BPM_LIMIT,
  utcDayIndex,
  utcDayKey,
  type PlayerProgressStats,
  type ProgressState,
} from '../progress'

const noonUtc = Date.parse('2026-09-13T12:00:00Z')
const today = utcDayIndex(noonUtc)

function stats(overrides: Partial<PlayerProgressStats> = {}): PlayerProgressStats {
  return {
    tradesTotal: 12,
    winStreak: 3,
    calmWins: 2,
    dayIndex: today,
    dayTrades: 4,
    ...overrides,
  }
}

describe('utc days', () => {
  test('match the program day number and render as an ISO date', () => {
    expect(today).toBe(Math.floor(noonUtc / 1000 / 86_400))
    expect(utcDayKey(today)).toBe('2026-09-13')
    expect(utcDayKey(0)).toBe('')
  })
})

describe('progressFromPlayer', () => {
  test('reads trades, streak, calm wins, and today trades from the Player account', () => {
    expect(progressFromPlayer(stats(), noonUtc)).toEqual({
      trades: 12,
      streak: 3,
      calmWins: 2,
      dayKey: '2026-09-13',
      dayTrades: 4,
    })
  })

  test('reads a day counter from an earlier UTC day as zero', () => {
    expect(progressFromPlayer(stats({ dayIndex: today - 1, dayTrades: 9 }), noonUtc).dayTrades).toBe(0)
  })

  test('shows empty progress before the Player account exists', () => {
    expect(progressFromPlayer(null, noonUtc)).toEqual(emptyProgressState())
  })
})

describe('progressHeartRateBpm', () => {
  test('only returns a reading while a device is live', () => {
    expect(progressHeartRateBpm({ live: true, bpm: 118 })).toBe(118)
    expect(progressHeartRateBpm({ live: false, bpm: 90 })).toBeNull()
    expect(progressHeartRateBpm({ live: true, bpm: null })).toBeNull()
    expect(progressHeartRateBpm(null)).toBeNull()
  })
})

describe('isCalmHeartRate', () => {
  test('counts only a reading strictly under 120', () => {
    expect(isCalmHeartRate(119)).toBe(true)
    expect(isCalmHeartRate(STEAL_HEART_BPM_LIMIT)).toBe(false)
    expect(isCalmHeartRate(0)).toBe(false)
    expect(isCalmHeartRate(null)).toBe(false)
  })
})

describe('progressTracks', () => {
  test('caps each track at its goal', () => {
    const state: ProgressState = { trades: 140, streak: 9, calmWins: 70, dayKey: '2026-09-13', dayTrades: 21 }

    expect(progressTracks(state).map((track) => [track.id, track.value, track.max])).toEqual([
      ['tradeMaster', 100, 100],
      ['streakClimber', 5, 5],
      ['stealHeart', 70, 70],
      ['dayTrader', 20, 20],
    ])
  })
})
