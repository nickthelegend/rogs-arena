export const STEAL_HEART_BPM_LIMIT = 120

const DAY_MS = 86_400_000

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

/** The Player account stats that drive the progress tracks. */
export type PlayerProgressStats = {
  tradesTotal: number
  winStreak: number
  calmWins: number
  dayIndex: number
  dayTrades: number
}

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

function wholeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function emptyProgressState(): ProgressState {
  return EMPTY_PROGRESS
}

/** The program counts days as UTC day numbers (unix seconds / 86_400). */
export function utcDayIndex(at = Date.now()) {
  return Math.floor(at / DAY_MS)
}

export function utcDayKey(dayIndex: number) {
  if (!Number.isFinite(dayIndex) || dayIndex <= 0) return ''
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10)
}

/** Reads progress from on-chain Player stats; a day counter from an earlier UTC day reads as zero. */
export function progressFromPlayer(player: PlayerProgressStats | null, at = Date.now()): ProgressState {
  if (!player) return EMPTY_PROGRESS

  const today = utcDayIndex(at)
  return {
    trades: wholeNumber(player.tradesTotal),
    streak: wholeNumber(player.winStreak),
    calmWins: wholeNumber(player.calmWins),
    dayKey: utcDayKey(today),
    dayTrades: player.dayIndex === today ? wholeNumber(player.dayTrades) : 0,
  }
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

export function progressTracks(state: ProgressState) {
  return PROGRESS_TRACKS.map((track) => ({
    ...track,
    value: Math.min(state[track.stat], track.max),
  }))
}
