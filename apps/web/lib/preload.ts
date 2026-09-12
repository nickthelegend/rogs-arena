import { ABILITY_CARDS } from '@/lib/ability'
import { TRADERS_PATH } from '@/lib/traders'

export const PRELOAD_MIN_MS = 700
export const PRELOAD_TIMEOUT_MS = 5_000
export const PRELOAD_FADE_MS = 400
export const PRELOAD_REDUCED_FADE_MS = 200

export const PRELOAD_REALTIME_PATHS = ['chat', TRADERS_PATH, 'market', 'trades'] as const

export const PRELOAD_IMAGE_URLS = [
  ...ABILITY_CARDS.flatMap((card) => [card.image, card.front]),
  '/background-texture.webp',
  '/icon.png',
  '/mark-orange.png',
  '/mark-purple.png',
]

export type PreloadPhase = 'blocking' | 'exiting' | 'gone'

export type PreloadStatusInput = {
  privyReady: boolean
  fontsReady: boolean
  imagesReady: boolean
  realtimeReady: boolean
  marketReady: boolean
  timedOut: boolean
  phase: PreloadPhase
}

export const PRELOAD_STATUS = {
  session: 'Restoring session',
  type: 'Loading type',
  art: 'Loading art',
  live: 'Syncing live data',
  market: 'Loading market',
  ready: 'Ready',
} as const

export function preloadFadeMs(reduceMotion: boolean) {
  return reduceMotion ? PRELOAD_REDUCED_FADE_MS : PRELOAD_FADE_MS
}

export function preloadStatusLabel(input: PreloadStatusInput) {
  if (input.phase === 'exiting' || input.phase === 'gone' || input.timedOut) return PRELOAD_STATUS.ready
  if (!input.privyReady) return PRELOAD_STATUS.session
  if (!input.fontsReady) return PRELOAD_STATUS.type
  if (!input.imagesReady) return PRELOAD_STATUS.art
  if (!input.realtimeReady) return PRELOAD_STATUS.live
  if (!input.marketReady) return PRELOAD_STATUS.market
  return PRELOAD_STATUS.ready
}

export function preloadCanReveal(input: {
  privyReady: boolean
  dataSettled: boolean
  minElapsed: boolean
  timedOut: boolean
}) {
  if (input.timedOut) return true
  return input.privyReady && input.dataSettled && input.minElapsed
}

export function advancePreloadPhase(phase: PreloadPhase, canReveal: boolean): PreloadPhase {
  if (phase === 'gone' || phase === 'exiting') return phase
  return canReveal ? 'exiting' : 'blocking'
}
