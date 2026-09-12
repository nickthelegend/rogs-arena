import { describe, expect, test } from 'bun:test'
import {
  canPlaceTrade,
  canTakeProfit,
  claimRewardsBody,
  settleAbilitiesBody,
  formatClaimResultMessage,
  formatPositionLine,
  formatTakeProfitResultMessage,
  formatTradeResultMessage,
  withAbilityMessage,
  outcomePositions,
  placePositionBody,
  positionTotal,
  balancesAfterPosition,
  sellablePositions,
  tradableForOutcome,
  tradingApiErrorMessage,
} from '../trading'
import type { UnifiedMarket } from '@somnia-chain/markets-sdk'

function market(overrides: Partial<UnifiedMarket> = {}): UnifiedMarket {
  return {
    id: 'm1',
    symbol: 'BTC-5M',
    quote: 'tUSDC',
    outcomes: [
      { label: 'YES', symbol: 'BTC-5M-YES' },
      { label: 'NO', symbol: 'BTC-5M-NO' },
    ],
    ...overrides,
  } as UnifiedMarket
}

describe('tradingApiErrorMessage', () => {
  test('prefers details, then error, then the fallback', () => {
    expect(tradingApiErrorMessage({ details: 'No ask liquidity' }, 'Failed')).toBe('No ask liquidity')
    expect(tradingApiErrorMessage({ error: 'Validation failed' }, 'Failed')).toBe('Validation failed')
    expect(tradingApiErrorMessage(null, 'Failed')).toBe('Failed')
  })
})

describe('outcomePositions', () => {
  test('reads YES and NO totals from the matching outcome symbols', () => {
    const positions = outcomePositions(market(), {
      'BTC-5M-YES': { total: 12.34 },
      'BTC-5M-NO': { total: 0 },
    })

    expect(positionTotal(positions, 'YES')).toBe(12.34)
    expect(positionTotal(positions, 'NO')).toBe(0)
    expect(formatPositionLine(positions)).toBe('YES 12.3 · NO 0')
  })

  test('treats a missing market or balance as a zero position', () => {
    expect(formatPositionLine(outcomePositions(null, null))).toBe('YES 0 · NO 0')
    expect(tradableForOutcome(market(), 'YES')).toBe('BTC-5M-YES')
    expect(tradableForOutcome(null, 'NO')).toBeNull()
  })
})

describe('balancesAfterPosition', () => {
  test('a successful extra buy increases the open lot even if a stale snapshot missed the fill', () => {
    const next = balancesAfterPosition({
      current: { 'BTC-5M-YES': { total: 8 } },
      reported: { 'BTC-5M-YES': { total: 8 }, tUSDC: { total: 90 } },
      symbol: 'BTC-5M-YES',
      side: 'buy',
      filled: 5,
    })

    expect(positionTotal(outcomePositions(market(), next), 'YES')).toBe(13)
    expect(next?.tUSDC?.total).toBe(90)
  })

  test('a first fill still opens a lot when the wallet snapshot is empty', () => {
    const next = balancesAfterPosition({
      current: null,
      symbol: 'BTC-5M-YES',
      side: 'buy',
      filled: 5,
    })

    expect(positionTotal(outcomePositions(market(), next), 'YES')).toBe(5)
  })

  test('a full sell clears the lot even if a stale snapshot still shows it', () => {
    const next = balancesAfterPosition({
      current: { 'BTC-5M-YES': { total: 8 } },
      reported: { 'BTC-5M-YES': { total: 8 } },
      symbol: 'BTC-5M-YES',
      side: 'sell',
      filled: 8,
    })

    expect(positionTotal(outcomePositions(market(), next), 'YES')).toBe(0)
  })
})

describe('placePositionBody', () => {
  test('builds a buy ticket with the default stake and slippage', () => {
    expect(
      placePositionBody({
        walletId: 'wal_1',
        marketId: `0x${'ab'.repeat(32)}`,
        marketSymbol: 'BTC-5M',
        tradable: 'BTC-5M-YES',
        outcome: 'YES',
        side: 'buy',
      }),
    ).toEqual({
      wallet_id: 'wal_1',
      market_id: `0x${'ab'.repeat(32)}`,
      market_symbol: 'BTC-5M',
      tradable: 'BTC-5M-YES',
      outcome: 'YES',
      side: 'buy',
      amount: 5,
      slippage_percent: 5,
    })
    expect(
      placePositionBody({
        walletId: 'wal_1',
        marketId: `0x${'ab'.repeat(32)}`,
        marketSymbol: 'BTC-5M',
        tradable: 'BTC-5M-YES',
        outcome: 'YES',
        side: 'buy',
        abilityId: 3,
      }),
    ).toMatchObject({ ability_id: 3 })
  })
})

describe('claimRewardsBody', () => {
  test('omits market ids so the api can scan closed markets', () => {
    expect(claimRewardsBody('wal_1')).toEqual({ wallet_id: 'wal_1' })
    expect(claimRewardsBody('wal_1', ['0x1'])).toEqual({ wallet_id: 'wal_1', market_ids: ['0x1'] })
  })
})

describe('settleAbilitiesBody', () => {
  test('includes the finished market and parked card when the round ends', () => {
    expect(settleAbilitiesBody('wal_1')).toEqual({ wallet_id: 'wal_1' })
    expect(settleAbilitiesBody('wal_1', { marketId: '0xabc', abilityId: 2 })).toEqual({
      wallet_id: 'wal_1',
      market_id: '0xabc',
      ability_id: 2,
    })
  })
})

describe('trade and claim copy', () => {
  test('describes a fill and a claim in one line', () => {
    expect(formatTradeResultMessage({ side: 'buy', outcome: 'YES', filled: 5, amount: 5 })).toBe(
      'Bought YES. Filled 5 of 5.',
    )
    expect(formatClaimResultMessage(0)).toBe('No settled rewards to claim yet.')
    expect(formatClaimResultMessage(2)).toBe('Claimed 2 rewards.')
    expect(
      withAbilityMessage('Sold YES. Filled 8 of 8.', {
        kind: 'protect_loss',
        status: 'paid',
        won: false,
        profit: -3,
        playerUsd: 3,
        recipientCount: 0,
      }),
    ).toBe('Sold YES. Filled 8 of 8. Ability paid $3.00.')
  })

  test('only a funded wallet with a live market can trade', () => {
    expect(canPlaceTrade({ walletId: 'wal_1', marketId: '0x1', tradable: 'YES', busy: false })).toBe(true)
    expect(canPlaceTrade({ walletId: 'wal_1', marketId: '0x1', tradable: 'YES', busy: true })).toBe(false)
    expect(canPlaceTrade({ walletId: null, marketId: '0x1', tradable: 'YES' })).toBe(false)
  })
})

describe('take profit', () => {
  test('only open share lots are sellable', () => {
    const positions = outcomePositions(market(), {
      'BTC-5M-YES': { total: 8 },
      'BTC-5M-NO': { total: 0 },
    })

    expect(sellablePositions(positions).map((position) => position.label)).toEqual(['YES'])
    expect(sellablePositions(positions, 'YES').map((position) => position.label)).toEqual(['YES'])
    expect(sellablePositions(positions, 'NO')).toEqual([])

    const both = outcomePositions(market(), {
      'BTC-5M-YES': { total: 8 },
      'BTC-5M-NO': { total: 3 },
    })
    expect(sellablePositions(both).map((position) => position.label)).toEqual(['YES', 'NO'])
    expect(sellablePositions(both, 'NO').map((position) => position.label)).toEqual(['NO'])
    expect(canTakeProfit({ walletId: 'wal_1', marketId: '0x1', positions, busy: false })).toBe(true)
    expect(canTakeProfit({ walletId: 'wal_1', marketId: '0x1', positions, busy: true })).toBe(false)
    expect(canTakeProfit({ walletId: 'wal_1', marketId: '0x1', positions: outcomePositions(market(), null) })).toBe(false)
  })

  test('sells the full lot size and summarizes one or both outcomes', () => {
    expect(
      placePositionBody({
        walletId: 'wal_1',
        marketId: `0x${'ab'.repeat(32)}`,
        marketSymbol: 'BTC-5M',
        tradable: 'BTC-5M-YES',
        outcome: 'YES',
        side: 'sell',
        amount: 8.25,
      }),
    ).toMatchObject({ side: 'sell', amount: 8.25, outcome: 'YES' })
    expect(formatTakeProfitResultMessage([{ outcome: 'YES', filled: 8, amount: 8 }])).toBe(
      'Sold YES. Filled 8 of 8.',
    )
    expect(
      formatTakeProfitResultMessage([
        { outcome: 'YES', filled: 8, amount: 8 },
        { outcome: 'NO', filled: 3, amount: 3 },
      ]),
    ).toBe('Sold 8 YES and 3 NO.')
  })
})
