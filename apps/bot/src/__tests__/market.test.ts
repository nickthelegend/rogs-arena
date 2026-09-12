import { describe, expect, test } from 'bun:test'
import type { UnifiedMarket } from '@somnia-chain/markets-sdk'
import { compareLiveMarkets, isIntervalOption, isLiveBtcMarket } from '../market.ts'

function market({
  id,
  symbol,
  base = 'BTC-100000',
  active = true,
  tradingStart,
  expiry,
  intervalSec = 300,
}: {
  id: string
  symbol: string
  base?: string
  active?: boolean
  tradingStart: number
  expiry: number
  intervalSec?: number
}): UnifiedMarket {
  return {
    id,
    symbol,
    base,
    active,
    outcomes: [
      { label: 'YES', symbol: `${id}-YES` },
      { label: 'NO', symbol: `${id}-NO` },
    ],
    info: {
      marketType: 'BINARY',
      intervalSec,
      tradingStart,
      expiry,
    },
  } as unknown as UnifiedMarket
}

describe('isLiveBtcMarket', () => {
  test('accepts the live BTC window and rejects others', () => {
    const now = 1_000
    const live = market({ id: 'live', symbol: 'LIVE', tradingStart: 900, expiry: 1_200 })
    const next = market({ id: 'next', symbol: 'NEXT', tradingStart: 1_200, expiry: 1_500 })
    const eth = market({ id: 'eth', symbol: 'ETH', base: 'ETH-4000', tradingStart: 900, expiry: 1_200 })

    expect(isLiveBtcMarket(live, now, 300)).toBe(true)
    expect(isLiveBtcMarket(next, now, 300)).toBe(false)
    expect(isLiveBtcMarket(eth, now, 300)).toBe(false)
    expect(isIntervalOption('5m')).toBe(true)
  })
})

describe('compareLiveMarkets', () => {
  test('prefers the earlier expiry', () => {
    const soon = market({ id: 'a', symbol: 'A', tradingStart: 900, expiry: 1_100 })
    const later = market({ id: 'b', symbol: 'B', tradingStart: 900, expiry: 1_200 })
    expect(compareLiveMarkets(soon, later)).toBeLessThan(0)
  })
})
