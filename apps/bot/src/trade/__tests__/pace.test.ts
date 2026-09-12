import { describe, expect, test } from 'bun:test'
import { createPace, logNormal, nextBeat } from '../pace.ts'

function sequence(values: number[]) {
  let index = 0
  return () => {
    const value = values[index] ?? 0
    index += 1
    return value
  }
}

describe('logNormal', () => {
  test('stays positive and spreads around the median', () => {
    const samples = Array.from({ length: 200 }, (_, i) => logNormal(8_000, 0.6, () => ((i + 1) % 97) / 97 || 0.01))
    expect(Math.min(...samples)).toBeGreaterThan(0)
    expect(Math.max(...samples)).toBeGreaterThan(8_000)
  })
})

describe('nextBeat', () => {
  test('honors a zero scale as immediate', () => {
    expect(nextBeat(createPace(), 0, () => 0.5)).toEqual({
      waitMs: 0,
      act: true,
      reuseWallet: false,
      kind: 'wander',
    })
  })

  test('opens a short burst, then keeps the next hits close', () => {
    const pace = createPace()
    const first = nextBeat(pace, 8_000, sequence([0.05, 0.4, 0.2]))
    expect(first.kind).toBe('burst')
    expect(first.act).toBe(true)
    expect(first.waitMs).toBeGreaterThan(0)
    expect(first.waitMs).toBeLessThan(10_000)

    const follow = nextBeat(pace, 8_000, sequence([0.2]))
    expect(follow.kind).toBe('burst')
    expect(follow.waitMs).toBeLessThan(8_000)
  })

  test('can sit out a pass or a long idle', () => {
    const pass = nextBeat(createPace(), 8_000, sequence([0.3, 0.5, 0.5]))
    expect(pass.kind).toBe('pass')
    expect(pass.act).toBe(false)

    const idle = nextBeat(createPace(), 8_000, sequence([0.18, 0.5, 0.5, 0.9]))
    expect(idle.kind).toBe('idle')
    expect(idle.waitMs).toBeGreaterThan(8_000)
  })
})
