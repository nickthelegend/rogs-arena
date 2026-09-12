export const PROGRESS_STORAGE_KEY = 'rizz.progress'
export const STEAL_HEART_BPM_LIMIT = 120

export type ProgressStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type ProgressState = {
  trades: number
  streak: number
  calmWins: number
  dayKey: string
  dayTrades: number
}

export type ProgressHeartRate = {
  live?: boolean
  bpm?: number | null
}

export type ProgressEvent =
  | { type: 'placed' }
  | { type: 'result'; won: boolean; heartRateBpm?: number | null }

export type ProgressTrackId = 'tradeMaster' | 'streakClimber' | 'stealHeart' | 'dayTrader'

export type ProgressTrack = {
  id: ProgressTrackId
  name: string
  max: number
  icon: string
  stat: keyof Pick<ProgressState, 'trades' | 'streak' | 'calmWins' | 'dayTrades'>
}

export const PROGRESS_TRACKS: ProgressTrack[] = [
  { id: 'tradeMaster', name: 'Trade Masters', max: 100, icon: '/badges/001.png', stat: 'trades' },
  { id: 'streakClimber', name: 'Streak Climber', max: 5, icon: '/badges/003.png', stat: 'streak' },
  { id: 'stealHeart', name: 'Steal Heart', max: 70, icon: '/badges/004.png', stat: 'calmWins' },
  { id: 'dayTrader', name: 'Day Trader', max: 20, icon: '/badges/006.png', stat: 'dayTrades' },
]

const EMPTY_PROGRESS: ProgressState = {
  trades: 0,
  streak: 0,
  calmWins: 0,
  dayKey: '',
  dayTrades: 0,
}

const listeners = new Set<() => void>()
let snapshot: { raw: string | null; dayKey: string; state: ProgressState } | null = null

export function subscribeProgress(listener: () => void) {
  listeners.add(listener)
  if (typeof window !== 'undefined' && listeners.size === 1) {
    window.addEventListener('storage', onProgressStorage)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined' && listeners.size === 0) {
      window.removeEventListener('storage', onProgressStorage)
    }
  }
}

function onProgressStorage(event: StorageEvent) {
  if (event.key !== PROGRESS_STORAGE_KEY && event.key !== null) return
  notifyProgress()
}

function notifyProgress() {
  snapshot = null
  for (const listener of listeners) listener()
}

function defaultProgressStorage(): ProgressStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function wholeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function emptyProgressState(): ProgressState {
  return EMPTY_PROGRESS
}

export function progressDayKey(at = Date.now()) {
  const date = new Date(at)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseProgress(value: unknown): ProgressState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_PROGRESS }

  const record = value as Record<string, unknown>
  return {
    trades: wholeNumber(record.trades),
    streak: wholeNumber(record.streak),
    calmWins: wholeNumber(record.calmWins),
    dayKey: typeof record.dayKey === 'string' ? record.dayKey : '',
    dayTrades: wholeNumber(record.dayTrades),
  }
}

export function rollProgressDay(state: ProgressState, at = Date.now()): ProgressState {
  const dayKey = progressDayKey(at)
  if (state.dayKey === dayKey) return state
  return { ...state, dayKey, dayTrades: 0 }
}

export function progressHeartRateBpm(heartRate?: ProgressHeartRate | null) {
  if (!heartRate?.live) return null
  const bpm = heartRate.bpm
  if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return null
  return bpm
}

export function isCalmHeartRate(bpm: number | null | undefined) {
  return typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0 && bpm < STEAL_HEART_BPM_LIMIT
}

export function applyProgressEvent(state: ProgressState, event: ProgressEvent, at = Date.now()): ProgressState {
  const next = rollProgressDay(state, at)

  if (event.type === 'placed') {
    return {
      ...next,
      trades: next.trades + 1,
      dayTrades: next.dayTrades + 1,
    }
  }

  return {
    ...next,
    streak: event.won ? next.streak + 1 : 0,
    calmWins: event.won && isCalmHeartRate(event.heartRateBpm) ? next.calmWins + 1 : next.calmWins,
  }
}

export function progressTracks(state: ProgressState) {
  return PROGRESS_TRACKS.map((track) => ({
    ...track,
    value: Math.min(state[track.stat], track.max),
  }))
}

function readRawProgress(storage: ProgressStorage | null) {
  if (!storage) return null

  try {
    return storage.getItem(PROGRESS_STORAGE_KEY)
  } catch {
    return null
  }
}

export function progressFromStorage(storage: ProgressStorage | null, at = Date.now()): ProgressState {
  const raw = readRawProgress(storage)
  if (!raw) return rollProgressDay({ ...EMPTY_PROGRESS }, at)

  try {
    return rollProgressDay(parseProgress(JSON.parse(raw) as unknown), at)
  } catch {
    return rollProgressDay({ ...EMPTY_PROGRESS }, at)
  }
}

export function writeProgress(state: ProgressState, storage: ProgressStorage | null = defaultProgressStorage()) {
  if (!storage) return

  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state))
    notifyProgress()
  } catch {
    // Storage can be unavailable in private mode.
  }
}

export function recordProgressEvent(
  event: ProgressEvent,
  storage: ProgressStorage | null = defaultProgressStorage(),
  at = Date.now(),
) {
  const next = applyProgressEvent(progressFromStorage(storage, at), event, at)
  writeProgress(next, storage)
  return next
}

export function readProgressSnapshot(at = Date.now()): ProgressState {
  const storage = defaultProgressStorage()
  const raw = readRawProgress(storage)
  const dayKey = progressDayKey(at)
  if (snapshot && snapshot.raw === raw && snapshot.dayKey === dayKey) return snapshot.state

  const state = progressFromStorage(storage, at)
  snapshot = { raw, dayKey, state }
  return state
}
