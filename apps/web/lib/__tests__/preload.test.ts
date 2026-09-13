import { describe, expect, test } from 'bun:test'
import { ABILITY_CARDS } from '../ability'
import {
  advancePreloadPhase,
  PRELOAD_IMAGE_URLS,
  PRELOAD_STATUS,
  preloadCanReveal,
  preloadFadeMs,
  preloadStatusLabel,
} from '../preload'

describe('preloadCanReveal', () => {
  test('stays covered until the wallet, data, and the minimum hold have all landed', () => {
    expect(preloadCanReveal({ walletReady: true, dataSettled: true, minElapsed: false, timedOut: false })).toBe(false)
    expect(preloadCanReveal({ walletReady: false, dataSettled: true, minElapsed: true, timedOut: false })).toBe(false)
    expect(preloadCanReveal({ walletReady: true, dataSettled: false, minElapsed: true, timedOut: false })).toBe(false)
  })

  test('reveals once auth and data are ready after the hold', () => {
    expect(preloadCanReveal({ walletReady: true, dataSettled: true, minElapsed: true, timedOut: false })).toBe(true)
  })

  test('reveals on timeout even if auth or data is still pending', () => {
    expect(preloadCanReveal({ walletReady: false, dataSettled: false, minElapsed: false, timedOut: true })).toBe(true)
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
    walletReady: false,
    fontsReady: false,
    imagesReady: false,
    realtimeReady: false,
    marketReady: false,
    timedOut: false,
    phase: 'blocking' as const,
  }

  test('names the next unfinished step', () => {
    expect(preloadStatusLabel(pending)).toBe(PRELOAD_STATUS.session)
    expect(preloadStatusLabel({ ...pending, walletReady: true })).toBe(PRELOAD_STATUS.type)
    expect(preloadStatusLabel({ ...pending, walletReady: true, fontsReady: true })).toBe(PRELOAD_STATUS.art)
    expect(preloadStatusLabel({ ...pending, walletReady: true, fontsReady: true, imagesReady: true })).toBe(
      PRELOAD_STATUS.live,
    )
    expect(
      preloadStatusLabel({
        ...pending,
        walletReady: true,
        fontsReady: true,
        imagesReady: true,
        realtimeReady: true,
      }),
    ).toBe(PRELOAD_STATUS.market)
  })

  test('reads ready once the board can open', () => {
    expect(
      preloadStatusLabel({
        walletReady: true,
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
  test('warms the ability art', () => {
    for (const card of ABILITY_CARDS) {
      expect(PRELOAD_IMAGE_URLS).toContain(card.image)
      expect(PRELOAD_IMAGE_URLS).toContain(card.front)
    }
  })
})
