import { describe, expect, test } from 'bun:test'
import type { LiveFill } from '@somnia-chain/markets-sdk'
import { fillTimestampMs, toMarketTrade, tradeKey, tradeOutcome, unpublishedTrades } from '../trade.ts'

function fill(overrides: Partial<LiveFill> = {}): LiveFill {
  return {
    id: '100_1',
    market_id: '0xmarket',
    pool: '0xpool',
    taker: '0xtaker',
    maker: '0xmaker',
    takerSide: 'BUY_YES',
    makerSide: 'SELL_YES',
    kind: 'DIRECT_YES',
    takerIsBid: true,
    takerOrder_id: 'taker-order',
    makerOrder_id: 'maker-order',
    fillPrice: '650000',
    quantity: '2000000',
    quoteQuantity: '1300000',
    takerRemainingQuantity: '0',
    makerRemainingQuantity: '0',
    timestamp: '1700000000',
    blockNumber: 100,
    logIndex: 1,
    txHash: '0xhash',
    ...overrides,
  } as LiveFill
}

describe('fillTimestampMs', () => {
  test('converts unix seconds to milliseconds', () => {
    expect(fillTimestampMs('1700000000')).toBe(1_700_000_000_000)
    expect(fillTimestampMs(undefined)).toBeUndefined()
    expect(fillTimestampMs('nope')).toBeUndefined()
  })
})

describe('tradeOutcome', () => {
  test('reads YES or NO from the taker side first', () => {
    expect(tradeOutcome('BUY_YES')).toBe('YES')
    expect(tradeOutcome('SELL_NO')).toBe('NO')
    expect(tradeOutcome(undefined, 'DIRECT_YES')).toBe('YES')
    expect(tradeOutcome(undefined, 'MINT_A_PAIR')).toBeNull()
  })
})

describe('toMarketTrade', () => {
  test('normalizes a live fill for firebase', () => {
    expect(toMarketTrade(fill(), 6, 6, 'm1', 'BTC-15m')).toEqual({
      id: '100_1',
      t: 1_700_000_000_000,
      marketId: 'm1',
      symbol: 'BTC-15m',
      side: 'BUY_YES',
      kind: 'DIRECT_YES',
      outcome: 'YES',
      price: 0.65,
      amount: 2,
      cost: 1.3,
      taker: '0xtaker',
    })
  })

  test('uses nulls when a fill is still resolving', () => {
    expect(
      toMarketTrade(
        fill({
          taker: undefined,
          takerSide: undefined,
          kind: undefined,
          timestamp: undefined as unknown as string,
        }),
        6,
        6,
        null,
        null,
      ),
    ).toEqual({
      id: '100_1',
      t: null,
      marketId: null,
      symbol: null,
      side: null,
      kind: null,
      outcome: null,
      price: 0.65,
      amount: 2,
      cost: 1.3,
      taker: null,
    })
  })
})

describe('unpublishedTrades', () => {
  test('returns only fills that have not been written yet', () => {
    const first = toMarketTrade(fill({ id: '1_1' }), 6, 6, 'm1', 'BTC')
    const second = toMarketTrade(fill({ id: '1_2' }), 6, 6, 'm1', 'BTC')

    expect(unpublishedTrades([first, second], ['1_1'])).toEqual([second])
    expect(unpublishedTrades([first], new Set(['1_1']))).toEqual([])
  })
})

describe('tradeKey', () => {
  test('keeps fill ids and strips firebase-forbidden characters', () => {
    expect(tradeKey('100_1')).toBe('100_1')
    expect(tradeKey('a/b.c#d$[e]')).toBe('a_b_c_d__e_')
  })
})
