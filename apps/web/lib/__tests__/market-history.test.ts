import { describe, expect, test } from 'bun:test'
import type { RoundDto } from '../arena-api'
import { historyOutcome, historyOutcomes, historySlotMs } from '../market-history'

const slotStart = 1_788_844_200
const slotEnd = slotStart + 300

function round(overrides: Partial<RoundDto> = {}): RoundDto {
  return {
    roundId: 12,
    startTs: slotStart,
    endTs: slotEnd,
    strikePrice: '7725512345678',
    closePrice: '7726000000000',
    priceExpo: 8,
    outcome: 'YES',
    yesPool: 210,
    noPool: 190,
    volume: 40,
    trades: 6,
    openedSig: 'openSig',
    resolvedSig: 'resolveSig',
    ...overrides,
  }
}

describe('historyOutcome', () => {
  test('reads YES as Y and NO as N', () => {
    expect(historyOutcome({ outcome: 'YES' })).toBe('Y')
    expect(historyOutcome({ outcome: 'NO' })).toBe('N')
  })

  test('leaves an unresolved round empty', () => {
    expect(historyOutcome({ outcome: null })).toBeNull()
  })
})

describe('historySlotMs', () => {
  test('puts a round in the five-minute slot its end closes', () => {
    expect(historySlotMs(slotEnd)).toBe(slotStart * 1000)
  })

  test('keeps a late-rolled round in the same slot', () => {
    expect(historySlotMs(slotEnd)).toBe(historySlotMs(slotEnd - 1))
    expect(historySlotMs(Number.NaN)).toBeNull()
  })
})

describe('historyOutcomes', () => {
  test('keys each resolved round by its slot', () => {
    expect(
      historyOutcomes([
        round({ roundId: 12, endTs: slotEnd, outcome: 'YES' }),
        round({ roundId: 11, startTs: slotStart - 300, endTs: slotStart, outcome: 'NO' }),
      ]),
    ).toEqual({
      [slotStart * 1000]: 'Y',
      [(slotStart - 300) * 1000]: 'N',
    })
  })

  test('skips rounds that have not resolved yet', () => {
    expect(
      historyOutcomes([
        round({ roundId: 13, startTs: slotEnd, endTs: slotEnd + 300, outcome: null, closePrice: null }),
        round({ roundId: 12, outcome: 'NO' }),
      ]),
    ).toEqual({ [slotStart * 1000]: 'N' })
  })
})
