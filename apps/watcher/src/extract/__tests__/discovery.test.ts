import { describe, expect, test } from 'bun:test'
import type { UnifiedMarket } from '@somnia-chain/markets-sdk'
import { dashboardExpiredMarketLimit } from '../../config.ts'
import { isLiveBtcMarket, isTargetBtcMarket, targetMarketStatus, toDashboardMarkets } from '../discovery.ts'

function market({
  id,
  symbol,
  base = 'BTC-100000',
  active = true,
  tradingStart,
  expiry,
  intervalSec = 900,
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

describe('targetMarketStatus', () => {
  test('classifies live, upcoming, expired, and inactive windows', () => {
    const now = 1_000
    const live = market({ id: 'live', symbol: 'LIVE', tradingStart: 900, expiry: 1_200 })
    const next = market({ id: 'next', symbol: 'NEXT', tradingStart: 1_200, expiry: 1_500 })
    const done = market({ id: 'done', symbol: 'DONE', tradingStart: 600, expiry: 900 })
    const off = market({ id: 'off', symbol: 'OFF', active: false, tradingStart: 900, expiry: 1_200 })

    expect(targetMarketStatus(live, now)).toBe('live')
    expect(targetMarketStatus(next, now)).toBe('upcoming')
    expect(targetMarketStatus(done, now)).toBe('expired')
    expect(targetMarketStatus(off, now)).toBe('inactive')
    expect(isLiveBtcMarket(live, now)).toBe(true)
    expect(isLiveBtcMarket(next, now)).toBe(false)
  })

  test('matches only the chosen market interval', () => {
    const now = 1_000
    const oneMinute = market({ id: '1m', symbol: 'ONE', tradingStart: 900, expiry: 960, intervalSec: 60 })
    const fiveMinute = market({ id: '5m', symbol: 'FIVE', tradingStart: 900, expiry: 1_200, intervalSec: 300 })
    const fifteenMinute = market({
      id: '15m',
      symbol: 'FIFTEEN',
      tradingStart: 900,
      expiry: 1_800,
      intervalSec: 900,
    })
    const oneHour = market({ id: '1h', symbol: 'HOUR', tradingStart: 900, expiry: 4_500, intervalSec: 3_600 })

    expect(isTargetBtcMarket(oneMinute, 60)).toBe(true)
    expect(isTargetBtcMarket(fiveMinute, 300)).toBe(true)
    expect(isTargetBtcMarket(fifteenMinute, 900)).toBe(true)
    expect(isTargetBtcMarket(oneHour, 3_600)).toBe(true)
    expect(isTargetBtcMarket(fiveMinute, 900)).toBe(false)
    expect(isTargetBtcMarket(oneHour, 900)).toBe(false)
    expect(isLiveBtcMarket(fifteenMinute, now, 900)).toBe(true)
    expect(isLiveBtcMarket(fiveMinute, now, 900)).toBe(false)
    expect(isLiveBtcMarket(oneHour, now, 3_600)).toBe(true)
  })
})

describe('toDashboardMarkets', () => {
  test('orders live then upcoming then recent expired, and caps expired rows', () => {
    const now = 10_000
    const markets = [
      market({ id: 'old-1', symbol: 'OLD-1', tradingStart: 1_000, expiry: 1_300 }),
      market({ id: 'old-2', symbol: 'OLD-2', tradingStart: 2_000, expiry: 2_300 }),
      market({ id: 'live', symbol: 'LIVE', tradingStart: 9_800, expiry: 10_100 }),
      market({ id: 'next', symbol: 'NEXT', tradingStart: 10_100, expiry: 10_400 }),
      ...Array.from({ length: dashboardExpiredMarketLimit + 2 }, (_, index) =>
        market({
          id: `done-${index}`,
          symbol: `DONE-${index}`,
          tradingStart: 3_000 + index,
          expiry: 3_300 + index,
        }),
      ),
    ]

    const rows = toDashboardMarkets(markets, now)

    expect(rows.map((row) => row.status)).toEqual([
      'live',
      'upcoming',
      ...Array.from({ length: dashboardExpiredMarketLimit }, () => 'expired' as const),
    ])
    expect(rows[0]?.symbol).toBe('LIVE')
    expect(rows[1]?.symbol).toBe('NEXT')
    expect(rows.filter((row) => row.status === 'expired')).toHaveLength(dashboardExpiredMarketLimit)
    expect(rows.some((row) => row.id === 'old-1')).toBe(false)
  })
})
