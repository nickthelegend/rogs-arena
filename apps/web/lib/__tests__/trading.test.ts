import { describe, expect, test } from 'bun:test'
import {
  ABILITY_CALM,
  ABILITY_CHEERS,
  ABILITY_DOUBLE,
  ABILITY_PROTECT,
  quoteBuy,
  quoteSell,
  withSlippage,
  type ArenaMarket,
  type PositionState,
} from '@rogs/arena-sdk'
import {
  abilityCode,
  abilitySettlementNote,
  binaryMarketId,
  buyQuote,
  canPlaceTrade,
  canTakeProfit,
  formatPositionLine,
  formatSettlementMessage,
  formatTakeProfitResultMessage,
  formatTradeResultMessage,
  outcomePositions,
  positionTotal,
  sellablePositions,
  sellQuote,
  tradableForOutcome,
  tradeBlockedReason,
  validateTradeAmount,
  withAbilityMessage,
} from '../trading'

const USD = 1_000_000n
const expiry = 1_788_844_500

function market(overrides: Partial<ArenaMarket> = {}): ArenaMarket {
  return {
    id: '42',
    symbol: 'BTC-5M-R42',
    quote: 'CHIPS',
    active: true,
    outcomes: [
      { label: 'YES', symbol: 'BTC-5M-R42#YES' },
      { label: 'NO', symbol: 'BTC-5M-R42#NO' },
    ],
    info: {
      marketId: '42',
      tradingStart: expiry - 300,
      expiry,
      intervalSec: 300,
      question: 'BTC closes at or above its opening price',
      venueId: 'rogs-arena',
    },
    roundId: 42,
    status: 1,
    strikePrice: 7_725_512_345_678n,
    priceExpo: 8,
    yesPool: 200n * USD,
    noPool: 200n * USD,
    yesPrice: 0.5,
    noPrice: 0.5,
    liquidity: 200n * USD,
    feeBps: 100n,
    ...overrides,
  }
}

function position(overrides: Partial<PositionState> = {}): PositionState {
  return {
    roundId: 42,
    yesShares: 0n,
    noShares: 0n,
    cost: 0n,
    proceeds: 0n,
    basisYes: 0n,
    basisNo: 0n,
    maxBpm: 0,
    heartSamples: 0,
    ability: 0,
    active: true,
    ...overrides,
  }
}

describe('outcomePositions', () => {
  test('reads YES and NO shares from the open round position only', () => {
    const positions = outcomePositions(market(), {
      positions: [position({ yesShares: 12_340_000n }), position({ roundId: 41, noShares: 9n * USD })],
    })

    expect(positionTotal(positions, 'YES')).toBe(12.34)
    expect(positionTotal(positions, 'NO')).toBe(0)
    expect(formatPositionLine(positions)).toBe('YES 12.3 · NO 0')
  })

  test('treats a missing market or player as a zero position', () => {
    expect(formatPositionLine(outcomePositions(null, null))).toBe('YES 0 · NO 0')
    expect(tradableForOutcome(market(), 'YES')).toBe('BTC-5M-R42#YES')
    expect(tradableForOutcome(null, 'NO')).toBeNull()
    expect(binaryMarketId(market())).toBe('42')
    expect(binaryMarketId(null)).toBeNull()
  })
})

describe('quotes', () => {
  test('buys against the pool of the chosen outcome with a 5% slippage floor', () => {
    const pools = market({ yesPool: 150n * USD, noPool: 250n * USD })
    const quote = buyQuote(pools, 'NO', 2)
    const expected = quoteBuy(250n * USD, 150n * USD, 2n * USD, 100n)

    expect(quote.amount).toBe(2n * USD)
    expect(quote.shares).toBe(expected?.shares ?? -1n)
    expect(quote.minShares).toBe(withSlippage(expected?.shares ?? 0n, 5))
  })

  test('quotes a second sale against the pools the first sale leaves behind', () => {
    const first = sellQuote(market(), 'YES', 4n * USD)
    const expected = quoteSell(200n * USD, 200n * USD, 4n * USD, 100n)

    expect(first.out).toBe(expected?.out ?? -1n)
    expect(first.pools.yesPool).toBe(expected?.poolSold ?? -1n)
    expect(first.pools.noPool).toBe(expected?.poolOther ?? -1n)

    const second = sellQuote(first.pools, 'NO', 2n * USD)
    expect(second.out).toBe(quoteSell(first.pools.noPool, first.pools.yesPool, 2n * USD, 100n)?.out ?? -1n)
  })

  test('enforces the on-chain trade size limits', () => {
    expect(() => validateTradeAmount(0.5)).toThrow('The smallest trade is $1.00.')
    expect(() => validateTradeAmount(101)).toThrow('The largest trade is $100.00.')
    expect(validateTradeAmount(2)).toBe(2n * USD)
  })
})

describe('tradeBlockedReason', () => {
  test('explains the round and lock windows', () => {
    expect(tradeBlockedReason(market(), expiry - 60)).toBeNull()
    expect(tradeBlockedReason(market(), expiry - 5)).toBe('Trading is locked for the last 5 seconds of the round.')
    expect(tradeBlockedReason(market(), expiry - 20, { ability: true })).toBe(
      'Ability cards lock 30 seconds before the round ends. Remove the card to trade now.',
    )
    expect(tradeBlockedReason(market({ active: false }), expiry - 60)).toBe(
      'This round has ended. The next round opens when the crank rolls it.',
    )
    expect(tradeBlockedReason(null, expiry)).toBe('No live round is open yet.')
  })
})

describe('abilityCode', () => {
  test('maps rack card ids straight to on-chain ability codes', () => {
    expect(abilityCode(undefined)).toBe(0)
    expect([1, 2, 3, 4].map((id) => abilityCode(id))).toEqual([ABILITY_DOUBLE, ABILITY_PROTECT, ABILITY_CALM, ABILITY_CHEERS])
    expect(() => abilityCode(9)).toThrow('Unknown ability card 9.')
  })
})

describe('trade gates', () => {
  test('only a ready wallet with a live market and free hands can trade or sell', () => {
    const positions = outcomePositions(market(), { positions: [position({ yesShares: 8n * USD })] })

    expect(canPlaceTrade({ walletId: 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr', marketId: '42', tradable: 'YES', busy: false })).toBe(true)
    expect(canPlaceTrade({ walletId: null, marketId: '42', tradable: 'YES' })).toBe(false)
    expect(sellablePositions(positions).map((item) => item.label)).toEqual(['YES'])
    expect(sellablePositions(positions, 'NO')).toEqual([])
    expect(canTakeProfit({ walletId: 'Ens1', marketId: '42', positions, busy: false })).toBe(true)
    expect(canTakeProfit({ walletId: 'Ens1', marketId: '42', positions, busy: true })).toBe(false)
  })
})

describe('result copy', () => {
  test('describes buys and sells with the measured ER latency', () => {
    expect(formatTradeResultMessage({ side: 'buy', outcome: 'YES', shares: 3.92, usd: 2, ms: 47.6 })).toBe(
      'Bought 3.9 YES for $2.00 in 48 ms on the MagicBlock ER.',
    )
    expect(formatTradeResultMessage({ side: 'sell', outcome: 'NO', shares: null, usd: null, ms: 30 })).toBe(
      'Sold NO in 30 ms on the MagicBlock ER.',
    )
    expect(
      formatTakeProfitResultMessage([
        { side: 'sell', outcome: 'YES', shares: 8, usd: 5.25, ms: 40 },
        { side: 'sell', outcome: 'NO', shares: 3, usd: 2.25, ms: 41 },
      ]),
    ).toBe('Sold 8 YES and 3 NO for $7.50.')
    expect(withAbilityMessage('Bought YES.', null)).toBe('Bought YES.')
  })

  test('says exactly what an on-chain settlement and its ability paid', () => {
    expect(formatSettlementMessage([])).toBe('No resolved positions to settle yet.')
    expect(
      formatSettlementMessage([
        { roundId: 41, payout: 8n * USD, profit: 3n * USD, ability: ABILITY_DOUBLE, bonus: 3n * USD, calm: false, cheers: false },
      ]),
    ).toBe('Settled 1 position: paid $11.00, P/L +$3.00. Double price paid $3.00.')
    expect(
      abilitySettlementNote({ roundId: 41, payout: 6n * USD, profit: USD, ability: ABILITY_CALM, bonus: 0n, calm: false, cheers: false }),
    ).toBe('Calm pulse did not pay: no calm heart rate under 120 bpm was recorded on-chain this round.')
    expect(
      abilitySettlementNote({ roundId: 41, payout: 0n, profit: -2n * USD, ability: ABILITY_PROTECT, bonus: 2n * USD, calm: false, cheers: false }),
    ).toBe('Protect loss refunded $2.00.')
    expect(
      abilitySettlementNote({ roundId: 41, payout: 6n * USD, profit: USD, ability: ABILITY_CHEERS, bonus: 0n, calm: false, cheers: true }),
    ).toBe('Cheers won: MagicBlock VRF will pick up to 10 traders to receive $1 each.')
  })
})
