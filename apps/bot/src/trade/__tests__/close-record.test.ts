import { describe, expect, test } from 'bun:test'
import { closeRecord } from '../close-record.ts'

describe('closeRecord', () => {
  test('normalizes the trader and rounds profit to cents', () => {
    expect(
      closeRecord({
        marketId: '0xabc',
        trader: '0xABCDEF',
        outcome: 'YES',
        exit: 'tp',
        profit: 1.239,
        shares: 12,
        t: 1_700_000_000_000,
      }),
    ).toEqual({
      marketId: '0xabc',
      trader: '0xabcdef',
      outcome: 'YES',
      exit: 'tp',
      profit: 1.24,
      shares: 12,
      t: 1_700_000_000_000,
    })
  })
})
