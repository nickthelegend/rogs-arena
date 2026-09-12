import { describe, expect, test } from 'bun:test'
import { closePositionKey, isMarketClose } from '../market-closes'

describe('isMarketClose', () => {
  test('accepts a firebase close and rejects a partial row', () => {
    expect(
      isMarketClose('c1', {
        marketId: 'm1',
        trader: '0x1111',
        outcome: 'YES',
        exit: 'tp',
        profit: 2.5,
        shares: 10,
        t: 1,
      }),
    ).toBe(true)
    expect(isMarketClose('c1', { marketId: 'm1', exit: 'tp' })).toBe(false)
    expect(closePositionKey('0xAB', 'NO')).toBe('0xab:NO')
  })
})
