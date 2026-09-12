import { describe, expect, test } from 'bun:test'
import {
  ABILITY_CARDS,
  abilityCardById,
  appendUnique,
  appliedAbilityRelease,
  dragLeanDeg,
  dragLeanFromLag,
  insertAt,
  islandAbilityMarketToApply,
  toggleFlippedId,
} from '../ability'

describe('appendUnique', () => {
  test('appends a card that is not already in the rack', () => {
    const [first, second] = ABILITY_CARDS
    expect(appendUnique([first], second)).toEqual([first, second])
  })

  test('does not duplicate a card already in the rack', () => {
    const [first, second] = ABILITY_CARDS
    expect(appendUnique([first, second], first)).toEqual([first, second])
  })
})

describe('insertAt', () => {
  test('reinserts at the original index', () => {
    const [first, second, third] = ABILITY_CARDS
    expect(insertAt([second, third], 0, first)).toEqual([first, second, third])
  })
})

describe('dragLeanDeg', () => {
  const topGrab = { width: 115, height: 164, grabX: 57.5, grabY: 24 }

  test('trails opposite a rightward swipe when held near the top', () => {
    expect(dragLeanDeg({ ...topGrab, vx: 500, vy: 0 })).toBeGreaterThan(0)
  })

  test('hangs near upright when held still at the top center', () => {
    expect(dragLeanDeg({ ...topGrab, vx: 0, vy: 0 })).toBeCloseTo(0, 0)
  })

  test('clamps extreme flicks', () => {
    expect(dragLeanDeg({ ...topGrab, vx: 20000, vy: 0 })).toBe(18)
    expect(dragLeanDeg({ ...topGrab, vx: -20000, vy: 0 })).toBe(-18)
  })
})

describe('dragLeanFromLag', () => {
  test('tilts right when the card lags to the right of the pointer', () => {
    expect(dragLeanFromLag(80)).toBeGreaterThan(0)
  })

  test('tilts left when the card lags to the left of the pointer', () => {
    expect(dragLeanFromLag(-80)).toBeLessThan(0)
  })

  test('clamps extreme lag', () => {
    expect(dragLeanFromLag(400)).toBe(18)
    expect(dragLeanFromLag(-400)).toBe(-18)
  })
})

describe('toggleFlippedId', () => {
  test('adds and removes an id', () => {
    expect(toggleFlippedId([], 1)).toEqual([1])
    expect(toggleFlippedId([1, 2], 1)).toEqual([2])
  })
})

describe('abilityCardById', () => {
  test('maps the four playable abilities', () => {
    expect(abilityCardById(1)?.kind).toBe('double_win')
    expect(abilityCardById(2)?.kind).toBe('protect_loss')
    expect(abilityCardById(3)?.kind).toBe('calm_pulse')
    expect(abilityCardById(4)?.kind).toBe('cheers_win')
    expect(abilityCardById(9)).toBeNull()
  })

  test('uses the painted front for each rack card', () => {
    expect(ABILITY_CARDS.map((card) => card.front)).toEqual([
      '/cards/001.png',
      '/cards/002.png',
      '/cards/003.png',
      '/cards/004.png',
    ])
  })
})

describe('islandAbilityMarketToApply', () => {
  test('applies the current market when the countdown hits zero', () => {
    expect(
      islandAbilityMarketToApply({ previousMarketId: '0xa', marketId: '0xa', remainingSeconds: 0 }),
    ).toBe('0xa')
  })

  test('applies the finished market when the live market rolls', () => {
    expect(
      islandAbilityMarketToApply({ previousMarketId: '0xa', marketId: '0xb', remainingSeconds: 300 }),
    ).toBe('0xa')
  })

  test('does not apply while the current market is still live', () => {
    expect(
      islandAbilityMarketToApply({ previousMarketId: '0xa', marketId: '0xa', remainingSeconds: 12 }),
    ).toBeNull()
    expect(
      islandAbilityMarketToApply({ previousMarketId: null, marketId: '0xa', remainingSeconds: 40 }),
    ).toBeNull()
  })
})

describe('appliedAbilityRelease', () => {
  test('consumes a used card and returns an unused one', () => {
    expect(appliedAbilityRelease({ bound: true, playCreated: false })).toBe('consume')
    expect(appliedAbilityRelease({ bound: false, playCreated: true })).toBe('consume')
    expect(appliedAbilityRelease({ bound: false, playCreated: false })).toBe('return')
  })
})
