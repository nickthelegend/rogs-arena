import { describe, expect, test } from 'bun:test'
import {
  formatAddress,
  formatCents,
  formatChartTime,
  formatDateTime,
  formatDecimalAmount,
  formatGmt7Hm,
  formatNumber,
  formatPercent,
  formatShares,
  formatUpdateTime,
  priceStatusLabel,
} from '../format'

describe('formatAddress', () => {
  test('truncates a wallet to the first six and last four characters', () => {
    expect(formatAddress('0x1111111111111111111111111111111111111111')).toBe('0x1111...1111')
  })
})

describe('formatPercent and formatNumber', () => {
  test('render a dash when the value is missing', () => {
    expect(formatPercent()).toBe('--')
    expect(formatNumber()).toBe('--')
  })

  test('formats a probability as a one-decimal percent', () => {
    expect(formatPercent(0.512)).toBe('51.2%')
  })
})

describe('clock formatters', () => {
  test('treat unix seconds and milliseconds as the same clock', () => {
    const at = Date.UTC(2026, 0, 1, 12, 30, 45)
    expect(formatChartTime(at / 1000)).toBe(formatUpdateTime(at))
  })

  test('returns Waiting when an update time is missing', () => {
    expect(formatUpdateTime()).toBe('Waiting')
  })

  test('formats a GMT+7 hour-minute label', () => {
    const noonUtc = Date.UTC(2026, 0, 1, 5, 0, 0)
    expect(formatGmt7Hm(noonUtc)).toBe('12:00')
    expect(formatGmt7Hm(Number.NaN)).toBe('')
  })

  test('formats a unix-second timestamp as a medium date', () => {
    expect(formatDateTime('1767225600')).toBe(new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(1_767_225_600_000)))
  })
})

describe('amount formatters', () => {
  test('trims trailing zeros on a decimal amount', () => {
    expect(formatDecimalAmount('2.5000')).toBe('2.5')
    expect(formatDecimalAmount(undefined)).toBe('0')
  })

  test('formats share size and entry cents', () => {
    expect(formatShares(100)).toBe('100')
    expect(formatShares(12.34)).toBe('12.3')
    expect(formatCents(0.123)).toBe('12.3¢')
  })
})

describe('priceStatusLabel', () => {
  test('names the feed state', () => {
    expect(priceStatusLabel('hydrating')).toBe('Syncing')
    expect(priceStatusLabel('live', Date.UTC(2026, 0, 1, 12, 0, 0))).toMatch(/^Live /)
  })
})
