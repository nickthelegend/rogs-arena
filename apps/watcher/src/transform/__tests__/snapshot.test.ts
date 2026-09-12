import { describe, expect, test } from 'bun:test'
import type { MarketTrade } from '../../types.ts'
import { toDashboardFills } from '../snapshot.ts'

function trade(id: string, price: number): MarketTrade {
  return {
    id,
    t: 1_700_000_000_000,
    marketId: 'm1',
    symbol: 'BTC',
    side: 'BUY_YES',
    kind: 'DIRECT_YES',
    outcome: 'YES',
    price,
    amount: 1,
    cost: price,
    taker: '0xtaker',
  }
}

describe('toDashboardFills', () => {
  test('keeps the newest fills first for the tape', () => {
    const trades = [trade('1', 0.4), trade('2', 0.5), trade('3', 0.6)]
    expect(toDashboardFills(trades).map((fill) => fill.id)).toEqual(['3', '2', '1'])
  })
})
