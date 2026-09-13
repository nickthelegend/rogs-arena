import { describe, expect, test } from 'bun:test'
import type { CloseDto } from '../arena-api'
import { closePositionKey, isMarketClose, marketCloseFromDto } from '../market-closes'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'

describe('isMarketClose', () => {
  test('accepts a complete close and rejects a partial row', () => {
    expect(
      isMarketClose('c1', {
        marketId: '42',
        trader: wallet,
        outcome: 'YES',
        exit: 'tp',
        profit: 2.5,
        shares: 10,
        t: 1,
      }),
    ).toBe(true)
    expect(isMarketClose('c1', { marketId: '42', exit: 'tp' })).toBe(false)
  })
})

describe('closePositionKey', () => {
  test('keys by the exact base58 trader, never lowercased', () => {
    expect(closePositionKey(wallet, 'NO')).toBe(`${wallet}:NO`)
    expect(closePositionKey(wallet, 'NO')).not.toBe(closePositionKey(wallet.toLowerCase(), 'NO'))
  })
})

describe('marketCloseFromDto', () => {
  test('maps an indexed on-chain sell exit onto the round market id', () => {
    const close: CloseDto = {
      id: '5xSig:1',
      roundId: 42,
      trader: wallet,
      outcome: 'NO',
      exit: 'sl',
      profit: -1.25,
      shares: 4.5,
      t: 1_788_844_210_000,
    }

    expect(marketCloseFromDto(close)).toEqual({
      id: '5xSig:1',
      marketId: '42',
      trader: wallet,
      outcome: 'NO',
      exit: 'sl',
      profit: -1.25,
      shares: 4.5,
      t: 1_788_844_210_000,
    })
  })
})
