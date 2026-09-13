import { describe, expect, test } from 'bun:test'
import { resolveHeldItems, type LeaderboardItem } from '../leaderboard'

// Real devnet round 15: 9.780446 YES bought for $5.00, round resolved NO, keeper settled payout 0 / P/L -5.
const shares = 9.780446
const avgPrice = 5 / shares

function item(overrides: Partial<LeaderboardItem> = {}): LeaderboardItem {
  return {
    id: 'FTBk:YES',
    trader: 'FTBkigFuLc2MWJQeq5mrZYakF5Lpoqmrz4CwfpnVmbEH',
    name: 'rogsjudge',
    avatar: '',
    frame: '',
    outcome: 'YES',
    side: undefined as unknown as LeaderboardItem['side'],
    shares,
    avgPrice,
    profit: 0.01,
    status: 'open',
    ...overrides,
  }
}

describe('resolveHeldItems', () => {
  test('a losing open position is worth nothing at resolution', () => {
    const [resolved] = resolveHeldItems([item()], 'NO')
    expect(resolved?.profit).toBeCloseTo(-5, 6)
  })

  test('a winning open position pays $1 per share', () => {
    const [resolved] = resolveHeldItems([item()], 'YES')
    expect(resolved?.profit).toBeCloseTo(shares - 5, 6)
  })

  test('closed rows keep their realized profit', () => {
    const closed = item({ status: 'closed' as LeaderboardItem['status'], profit: -0.0995 })
    expect(resolveHeldItems([closed], 'NO')[0]).toBe(closed)
  })
})
