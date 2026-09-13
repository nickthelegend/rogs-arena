import { describe, expect, test } from 'bun:test'
import type { TradeDto } from '../arena-api'
import { marketTradeAction, marketTradeFromDto, marketTradeOutcome, toTradeMarkers, type MarketTrade } from '../market-trades'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'

function trade(overrides: Partial<MarketTrade> = {}): MarketTrade {
  return {
    id: 'sig:0',
    t: 1_700_000_000_000,
    marketId: '42',
    outcome: 'YES',
    taker: wallet,
    ...overrides,
  }
}

function dto(overrides: Partial<TradeDto> = {}): TradeDto {
  return {
    id: '5xSig:0',
    sig: '5xSig',
    roundId: 42,
    owner: wallet,
    side: 'BUY',
    outcome: 'NO',
    amount: 2,
    shares: 3.9,
    price: 2 / 3.9,
    yesPrice: 0.52,
    fee: 0.02,
    realizedPnl: 0,
    ability: 0,
    t: 1_788_844_230_000,
    ...overrides,
  }
}

describe('toTradeMarkers', () => {
  test('maps a fill onto the matching series with a base58 short name', () => {
    expect(toTradeMarkers([trade()])).toEqual([
      {
        id: 'sig:0',
        time: 1_700_000_000,
        seriesId: 'yes',
        avatar: expect.any(String),
        name: 'Ens1…yVvr',
      },
    ])
  })

  test('puts NO fills on the no series and reads side when outcome is missing', () => {
    const [marker] = toTradeMarkers([trade({ outcome: null, side: 'BUY_NO', kind: null })])
    expect(marker?.seriesId).toBe('no')
  })

  test('drops fills without a time or outcome', () => {
    expect(toTradeMarkers([trade({ t: Number.NaN }), trade({ outcome: null, side: null, kind: null })])).toEqual([])
  })
})

describe('marketTradeFromDto', () => {
  test('maps an on-chain buy to shares, USD cost, and a parseable side', () => {
    const mapped = marketTradeFromDto(dto())

    expect(mapped).toEqual({
      id: '5xSig:0',
      t: 1_788_844_230_000,
      marketId: '42',
      symbol: null,
      side: 'BUY_NO',
      kind: null,
      outcome: 'NO',
      price: 2 / 3.9,
      amount: 3.9,
      cost: 2,
      taker: wallet,
    })
    expect(marketTradeAction(mapped)).toBe('buy')
    expect(marketTradeOutcome(mapped)).toBe('NO')
  })

  test('keeps a sell readable as a sell of its outcome', () => {
    const mapped = marketTradeFromDto(dto({ side: 'SELL', outcome: 'YES', amount: 1.8, shares: 3, price: 0.6 }))

    expect(mapped.side).toBe('SELL_YES')
    expect(marketTradeAction(mapped)).toBe('sell')
    expect(marketTradeOutcome(mapped)).toBe('YES')
    expect(mapped.cost).toBe(1.8)
    expect(mapped.amount).toBe(3)
  })
})
