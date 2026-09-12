import { describe, expect, test } from 'bun:test'
import { ABILITY_CARDS } from '../ability'
import {
  advancePreloadPhase,
  PRELOAD_IMAGE_URLS,
  PRELOAD_REALTIME_PATHS,
  PRELOAD_STATUS,
  preloadCanReveal,
  preloadFadeMs,
  preloadStatusLabel,
} from '../preload'
import { TRADERS_PATH } from '../traders'

describe('preloadCanReveal', () => {
  test('stays covered until privy, data, and the minimum hold have all landed', () => {
    expect(preloadCanReveal({ privyReady: true, dataSettled: true, minElapsed: false, timedOut: false })).toBe(false)
    expect(preloadCanReveal({ privyReady: false, dataSettled: true, minElapsed: true, timedOut: false })).toBe(false)
    expect(preloadCanReveal({ privyReady: true, dataSettled: false, minElapsed: true, timedOut: false })).toBe(false)
  })

  test('reveals once auth and data are ready after the hold', () => {
    expect(preloadCanReveal({ privyReady: true, dataSettled: true, minElapsed: true, timedOut: false })).toBe(true)
  })

  test('reveals on timeout even if auth or data is still pending', () => {
    expect(preloadCanReveal({ privyReady: false, dataSettled: false, minElapsed: false, timedOut: true })).toBe(true)
  })
})

describe('advancePreloadPhase', () => {
  test('starts exiting when it can reveal', () => {
    expect(advancePreloadPhase('blocking', false)).toBe('blocking')
    expect(advancePreloadPhase('blocking', true)).toBe('exiting')
  })

  test('does not restart after it has left the screen', () => {
    expect(advancePreloadPhase('exiting', true)).toBe('exiting')
    expect(advancePreloadPhase('exiting', false)).toBe('exiting')
    expect(advancePreloadPhase('gone', true)).toBe('gone')
    expect(advancePreloadPhase('gone', false)).toBe('gone')
  })
})

describe('preloadStatusLabel', () => {
  const pending = {
    privyReady: false,
    fontsReady: false,
    imagesReady: false,
    realtimeReady: false,
    marketReady: false,
    timedOut: false,
    phase: 'blocking' as const,
  }

  test('names the next unfinished step', () => {
    expect(preloadStatusLabel(pending)).toBe(PRELOAD_STATUS.session)
    expect(preloadStatusLabel({ ...pending, privyReady: true })).toBe(PRELOAD_STATUS.type)
    expect(preloadStatusLabel({ ...pending, privyReady: true, fontsReady: true })).toBe(PRELOAD_STATUS.art)
    expect(preloadStatusLabel({ ...pending, privyReady: true, fontsReady: true, imagesReady: true })).toBe(
      PRELOAD_STATUS.live,
    )
    expect(
      preloadStatusLabel({
        ...pending,
        privyReady: true,
        fontsReady: true,
        imagesReady: true,
        realtimeReady: true,
      }),
    ).toBe(PRELOAD_STATUS.market)
  })

  test('reads ready once the board can open', () => {
    expect(
      preloadStatusLabel({
        privyReady: true,
        fontsReady: true,
        imagesReady: true,
        realtimeReady: true,
        marketReady: true,
        timedOut: false,
        phase: 'blocking',
      }),
    ).toBe(PRELOAD_STATUS.ready)
    expect(preloadStatusLabel({ ...pending, phase: 'exiting' })).toBe(PRELOAD_STATUS.ready)
    expect(preloadStatusLabel({ ...pending, timedOut: true })).toBe(PRELOAD_STATUS.ready)
  })
})

describe('preloadFadeMs', () => {
  test('keeps a short opacity fade when motion is reduced', () => {
    expect(preloadFadeMs(false)).toBe(400)
    expect(preloadFadeMs(true)).toBe(200)
  })
})

describe('preload assets', () => {
  test('warms ability art and the live firebase paths', () => {
    for (const card of ABILITY_CARDS) {
      expect(PRELOAD_IMAGE_URLS).toContain(card.image)
      expect(PRELOAD_IMAGE_URLS).toContain(card.front)
    }
    expect(PRELOAD_REALTIME_PATHS).toEqual(['chat', TRADERS_PATH, 'market', 'trades'])
  })
})
