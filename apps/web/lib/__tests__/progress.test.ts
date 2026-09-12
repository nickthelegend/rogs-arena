import { describe, expect, test } from 'bun:test'
import {
  PROGRESS_STORAGE_KEY,
  STEAL_HEART_BPM_LIMIT,
  applyProgressEvent,
  emptyProgressState,
  isCalmHeartRate,
  parseProgress,
  progressDayKey,
  progressFromStorage,
  progressHeartRateBpm,
  progressTracks,
  recordProgressEvent,
  type ProgressState,
} from '../progress'

function memoryStorage(initial: Record<string, string> = {}) {
  const memory = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  }
}

function state(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    trades: 0,
    streak: 0,
    calmWins: 0,
    dayKey: '2026-09-10',
    dayTrades: 0,
    ...overrides,
  }
}

const noon = Date.parse('2026-09-10T12:00:00')
const nextNoon = Date.parse('2026-09-11T12:00:00')

describe('parseProgress', () => {
  test('reads whole numbers and drops invalid payloads', () => {
    expect(parseProgress({ trades: 12.9, streak: 3, calmWins: 8, dayKey: '2026-09-10', dayTrades: 4 })).toEqual({
      trades: 12,
      streak: 3,
      calmWins: 8,
      dayKey: '2026-09-10',
      dayTrades: 4,
    })
    expect(parseProgress(null)).toEqual(emptyProgressState())
    expect(parseProgress({ trades: -2, streak: '3', dayTrades: Number.NaN })).toEqual({
      trades: 0,
      streak: 0,
      calmWins: 0,
      dayKey: '',
      dayTrades: 0,
    })
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
  test('counts only a live reading strictly under 120', () => {
    expect(isCalmHeartRate(119)).toBe(true)
    expect(isCalmHeartRate(STEAL_HEART_BPM_LIMIT)).toBe(false)
    expect(isCalmHeartRate(0)).toBe(false)
    expect(isCalmHeartRate(null)).toBe(false)
  })
})

describe('applyProgressEvent', () => {
  test('counts a placed trade toward Trade Master and Day Trader', () => {
    const next = applyProgressEvent(state(), { type: 'placed' }, noon)
    expect(next.trades).toBe(1)
    expect(next.dayTrades).toBe(1)
    expect(next.dayKey).toBe(progressDayKey(noon))
  })

  test('resets the daily count after midnight', () => {
    const sameDay = applyProgressEvent(state({ trades: 4, dayTrades: 4 }), { type: 'placed' }, noon)
    const nextDay = applyProgressEvent(sameDay, { type: 'placed' }, nextNoon)
    expect(sameDay.dayTrades).toBe(5)
    expect(nextDay.trades).toBe(6)
    expect(nextDay.dayTrades).toBe(1)
    expect(nextDay.dayKey).toBe(progressDayKey(nextNoon))
  })

  test('climbs a win streak and resets it on a loss', () => {
    let next = state()
    for (let i = 0; i < 5; i++) {
      next = applyProgressEvent(next, { type: 'result', won: true }, noon)
    }
    expect(next.streak).toBe(5)

    next = applyProgressEvent(next, { type: 'result', won: false }, noon)
    expect(next.streak).toBe(0)
  })

  test('counts Steal Heart only on a win with heart rate under 120', () => {
    const calmWin = applyProgressEvent(state(), { type: 'result', won: true, heartRateBpm: 119 }, noon)
    const hotWin = applyProgressEvent(calmWin, { type: 'result', won: true, heartRateBpm: 120 }, noon)
    const disconnected = applyProgressEvent(hotWin, { type: 'result', won: true, heartRateBpm: null }, noon)
    const loss = applyProgressEvent(disconnected, { type: 'result', won: false, heartRateBpm: 80 }, noon)

    expect(calmWin.calmWins).toBe(1)
    expect(hotWin.calmWins).toBe(1)
    expect(disconnected.calmWins).toBe(1)
    expect(loss.calmWins).toBe(1)
    expect(loss.streak).toBe(0)
  })
})

describe('progressTracks', () => {
  test('caps each track at its goal', () => {
    const tracks = progressTracks(
      state({
        trades: 140,
        streak: 9,
        calmWins: 70,
        dayTrades: 21,
      }),
    )

    expect(tracks.map((track) => [track.id, track.value, track.max])).toEqual([
      ['tradeMaster', 100, 100],
      ['streakClimber', 5, 5],
      ['stealHeart', 70, 70],
      ['dayTrader', 20, 20],
    ])
  })
})

describe('progress storage', () => {
  test('persists a placed trade and a calm win', () => {
    const storage = memoryStorage()

    recordProgressEvent({ type: 'placed' }, storage, noon)
    recordProgressEvent({ type: 'result', won: true, heartRateBpm: 110 }, storage, noon)

    const stored = JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY) ?? '{}') as ProgressState
    expect(stored).toEqual({
      trades: 1,
      streak: 1,
      calmWins: 1,
      dayKey: progressDayKey(noon),
      dayTrades: 1,
    })
    expect(progressFromStorage(storage, noon)).toEqual(stored)
  })

  test('rolls a stale day when reading without writing a new trade', () => {
    const storage = memoryStorage({
      [PROGRESS_STORAGE_KEY]: JSON.stringify(state({ trades: 8, dayTrades: 8 })),
    })

    expect(progressFromStorage(storage, nextNoon)).toMatchObject({
      trades: 8,
      dayTrades: 0,
      dayKey: progressDayKey(nextNoon),
    })
  })
})
