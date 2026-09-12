import { describe, expect, test } from 'bun:test'
import { historyOutcome, historyOutcomes, historySlotMs } from '../market-history'

const openingVenue = '0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c'
const pricefeedVenue = '0x1a1e6821cde7d0159c0d293177871e09677b4e42307c7db3ba94f8648a5a050f'
const yesStart = 1_788_844_200
const noStart = 1_788_843_900

function market(overrides: Partial<Parameters<typeof historyOutcomes>[0][number]> = {}) {
  return {
    tradingStart: yesStart,
    winningOutcome: 0,
    voided: false,
    question: 'BTC closes at or above its opening price',
    venueId: openingVenue,
    ...overrides,
  }
}

describe('historyOutcome', () => {
  test('reads YES as Y and NO as N', () => {
    expect(historyOutcome({ winningOutcome: 0 })).toBe('Y')
    expect(historyOutcome({ winningOutcome: 1 })).toBe('N')
  })

  test('leaves unresolved and voided markets empty', () => {
    expect(historyOutcome({ winningOutcome: null })).toBeNull()
    expect(historyOutcome({ winningOutcome: 0, voided: true })).toBeNull()
  })
})

describe('historyOutcomes', () => {
  test('keys each resolved market by its trading-start slot', () => {
    expect(
      historyOutcomes([
        market({ tradingStart: String(yesStart), winningOutcome: 0 }),
        market({ tradingStart: noStart, winningOutcome: 1 }),
      ]),
    ).toEqual({
      [yesStart * 1000]: 'Y',
      [noStart * 1000]: 'N',
    })
    expect(historySlotMs(String(yesStart))).toBe(yesStart * 1000)
  })

  test('keeps the current venue when two series share a slot', () => {
    expect(
      historyOutcomes(
        [
          market({
            winningOutcome: 0,
            venueId: openingVenue,
            question: 'BTC closes at or above its opening price',
          }),
          market({
            winningOutcome: 1,
            venueId: pricefeedVenue,
            question: 'Pricefeed test: will BTC/USDC\'s price be at or above 78657.71 at unix time 1788844500?',
          }),
        ],
        { venueId: pricefeedVenue },
      ),
    ).toEqual({ [yesStart * 1000]: 'N' })
  })

  test('falls back to the opening-price series when no venue is selected', () => {
    expect(
      historyOutcomes([
        market({
          winningOutcome: 1,
          venueId: pricefeedVenue,
          question: 'Pricefeed test: will BTC/USDC\'s price be at or above 78657.71 at unix time 1788844500?',
        }),
        market({ winningOutcome: 0, venueId: openingVenue }),
      ]),
    ).toEqual({ [yesStart * 1000]: 'Y' })
  })

  test('skips markets that have not resolved yet', () => {
    expect(
      historyOutcomes([market({ winningOutcome: null }), market({ tradingStart: noStart, winningOutcome: 1 })]),
    ).toEqual({ [noStart * 1000]: 'N' })
  })
})
