import { describe, expect, test } from 'bun:test'
import { toTradeMarkers, type MarketTrade } from '../market-trades'

function trade(overrides: Partial<MarketTrade> = {}): MarketTrade {
  return {
    id: '100_1',
    t: 1_700_000_000_000,
    marketId: 'm1',
    outcome: 'YES',
    taker: '0x1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  }
}

describe('toTradeMarkers', () => {
  test('maps a firebase fill onto the matching series', () => {
    expect(toTradeMarkers([trade()])).toEqual([
      {
        id: '100_1',
        time: 1_700_000_000,
        seriesId: 'yes',
        avatar: expect.any(String),
        name: '0x1234...5678',
      },
    ])
  })

  test('puts NO fills on the no series and reads side when outcome is missing', () => {
    const [marker] = toTradeMarkers([trade({ outcome: null, side: 'BUY_NO', kind: 'DIRECT_NO' })])
    expect(marker?.seriesId).toBe('no')
  })

  test('drops fills without a time or outcome', () => {
    expect(toTradeMarkers([trade({ t: Number.NaN }), trade({ outcome: null, side: null, kind: null })])).toEqual([])
  })
})
