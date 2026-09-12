import { describe, expect, test } from 'bun:test'
import { formatCountdown, formatMarketTiming, formatSource, marketStatusLabel } from '../format'

describe('formatCountdown', () => {
  test('formats remaining minutes and seconds', () => {
    expect(formatCountdown(100, 90_000)).toBe('10s')
    expect(formatCountdown(200, 100_000)).toBe('1m 40s')
    expect(formatCountdown(50, 50_000)).toBe('0s')
  })
})

describe('formatMarketTiming', () => {
  test('labels live, upcoming, and expired markets', () => {
    expect(formatMarketTiming({ id: '1', symbol: 'LIVE', status: 'live', expirySeconds: 200 }, 100_000)).toBe(
      '1m 40s left',
    )
    expect(formatMarketTiming({ id: '2', symbol: 'NEXT', status: 'upcoming', tradingStartSeconds: 160 }, 100_000)).toBe(
      'in 1m 00s',
    )
    expect(formatMarketTiming({ id: '3', symbol: 'DONE', status: 'expired' }, 100_000)).toBe('ended')
  })
})

describe('labels', () => {
  test('maps status and source for the roster', () => {
    expect(marketStatusLabel('live')).toBe('LIVE')
    expect(marketStatusLabel('upcoming')).toBe('NEXT')
    expect(formatSource('last_price')).toBe('last price')
    expect(formatSource('book')).toBe('book')
  })
})
