import { describe, expect, test } from 'bun:test'
import {
  formatAddress,
  formatCents,
  formatChartTime,
  formatDateTime,
  formatDecimalAmount,
  formatLocalHm,
  formatLocalTime,
  formatNumber,
  formatPercent,
  formatShares,
  formatUpdateTime,
  priceStatusLabel,
} from '../format'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

describe('formatAddress', () => {
  test('keeps the first four and last four base58 characters without changing case', () => {
    expect(formatAddress(wallet)).toBe('Ens1…yVvr')
  })

  test('leaves an address that is already short untouched', () => {
    expect(formatAddress('Ens1yVvr')).toBe('Ens1yVvr')
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

  test('formats hour-minute in the viewer local time zone', () => {
    const at = Date.UTC(2026, 0, 1, 5, 7, 0)
    const local = new Date(at)
    expect(formatLocalHm(at)).toBe(`${pad(local.getHours())}:${pad(local.getMinutes())}`)
    expect(formatLocalHm(Number.NaN)).toBe('')
  })

  test('formats a local clock with the local zone name', () => {
    const at = Date.UTC(2026, 0, 1, 5, 7, 9)
    const local = new Date(at)
    const clock = `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`
    expect(formatLocalTime(at).startsWith(clock)).toBe(true)
    expect(formatLocalTime(at)).not.toContain('GMT+7')
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
    expect(priceStatusLabel('error')).toBe('Feed error')
    expect(priceStatusLabel('live', Date.UTC(2026, 0, 1, 12, 0, 0))).toMatch(/^Live /)
  })
})
