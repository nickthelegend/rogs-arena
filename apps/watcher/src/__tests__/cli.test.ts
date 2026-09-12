import { describe, expect, test } from 'bun:test'
import { parseWatcherArgs } from '../cli.ts'

describe('parseWatcherArgs', () => {
  test('defaults to 15m', () => {
    expect(parseWatcherArgs([])).toEqual({ interval: '15m' })
    expect(parseWatcherArgs(['--watch'])).toEqual({ interval: '15m' })
  })

  test('accepts 1m, 5m, 15m, and 1h', () => {
    expect(parseWatcherArgs(['--interval', '1m'])).toEqual({ interval: '1m' })
    expect(parseWatcherArgs(['--interval', '5m'])).toEqual({ interval: '5m' })
    expect(parseWatcherArgs(['--interval=15m'])).toEqual({ interval: '15m' })
    expect(parseWatcherArgs(['--interval', '1h'])).toEqual({ interval: '1h' })
  })

  test('rejects missing and unknown intervals', () => {
    expect(() => parseWatcherArgs(['--interval'])).toThrow('--interval must be one of 1m, 5m, 15m, 1h')
    expect(() => parseWatcherArgs(['--interval', '30m'])).toThrow('--interval must be one of 1m, 5m, 15m, 1h, got: 30m')
  })
})
