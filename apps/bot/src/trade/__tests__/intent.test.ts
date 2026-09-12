import { describe, expect, test } from 'bun:test'
import { exitReason, oppositeOutcome, pickCost, pickExitIntent, pickIntent, tradeSide, walletBias } from '../intent.ts'
import {
  assertTradeCost,
  maxTradeCost,
  minTradeCost,
  resolveCostBounds,
  type BookPrices,
  type WalletPositions,
} from '../types.ts'

const yesWallet = '0x0000000000000000000000000000000000000000'
const noWallet = '0x0000000000000000000000000000000000000001'

const funded: WalletPositions = { yes: 0, no: 0, collateral: 40 }
const longYes: WalletPositions = { yes: 30, no: 0, collateral: 40 }
const prices: BookPrices = { yesBid: 0.6, noBid: 0.4 }

function sequence(values: number[]) {
  let index = 0
  return () => {
    const value = values[index] ?? 0
    index += 1
    return value
  }
}

describe('walletBias', () => {
  test('is sticky per address', () => {
    expect(walletBias(yesWallet)).toBe('YES')
    expect(walletBias(noWallet)).toBe('NO')
    expect(walletBias(yesWallet)).toBe('YES')
  })
})

describe('tradeSide', () => {
  test('covers every binary side', () => {
    expect(tradeSide('YES', 'buy')).toBe('BUY_YES')
    expect(tradeSide('NO', 'buy')).toBe('BUY_NO')
    expect(tradeSide('YES', 'sell')).toBe('SELL_YES')
    expect(tradeSide('NO', 'sell')).toBe('SELL_NO')
    expect(oppositeOutcome('YES')).toBe('NO')
  })
})

describe('pickCost', () => {
  test('stays between the floor and the limit', () => {
    expect(pickCost(3)).toBeNull()
    expect(pickCost(3.01, () => 0)).toBeCloseTo(3.01, 8)
    expect(pickCost(5, () => 0)).toBeGreaterThan(minTradeCost)
    expect(pickCost(5, () => 1)).toBe(5)
    expect(pickCost(100, () => 1)).toBe(maxTradeCost)
    expect(pickCost(40, () => 1, { min: 5, limit: 8 })).toBe(8)
  })
})

describe('resolveCostBounds', () => {
  test('accepts a 3–5 band and rejects a limit on the floor', () => {
    expect(() => resolveCostBounds({ limit: 3 })).toThrow('limit cost must be greater than 3')
    expect(resolveCostBounds({ limit: 5 })).toEqual({ min: 3, limit: 5 })
    expect(resolveCostBounds({ limit: 20 })).toEqual({ min: 3, limit: 20 })
  })
})

describe('pickIntent', () => {
  test('buys the wallet bias when it has no position', () => {
    const intent = pickIntent(yesWallet, funded, prices, sequence([0.1, 0.9, 0.5]))
    expect(intent?.side).toBe('BUY_YES')
    expect(intent?.cost).toBeGreaterThan(minTradeCost)
  })

  test('can flip away from the wallet bias', () => {
    const intent = pickIntent(yesWallet, funded, prices, sequence([0.99, 0.9, 0.5]))
    expect(intent?.side).toBe('BUY_NO')
  })

  test('sells the biased outcome when the position is large enough', () => {
    const intent = pickIntent(yesWallet, longYes, prices, sequence([0.1, 0.1, 0.5]))
    expect(intent?.side).toBe('SELL_YES')
    expect(intent?.cost).toBeGreaterThan(minTradeCost)
    expect(intent?.cost).toBeLessThanOrEqual(30 * 0.6)
  })

  test('sells NO when that wallet is biased NO and funded on that side', () => {
    const intent = pickIntent(noWallet, { yes: 0, no: 40, collateral: 40 }, prices, sequence([0.1, 0.1, 0.5]))
    expect(intent?.side).toBe('SELL_NO')
    expect(intent?.cost).toBeGreaterThan(minTradeCost)
  })

  test('skips when the wallet cannot fund a trade above 3', () => {
    expect(pickIntent(yesWallet, { yes: 0, no: 0, collateral: 3 }, prices, () => 0.1)).toBeNull()
  })

  test('caps each trade at the limit cost', () => {
    const intent = pickIntent(yesWallet, funded, prices, sequence([0.1, 0.9, 1]), { limit: 7 })
    expect(intent?.cost).toBeGreaterThan(minTradeCost)
    expect(intent?.cost).toBeLessThanOrEqual(7)
  })

  test('takes profit on a winner before rolling a random sell', () => {
    const intent = pickIntent(yesWallet, { ...longYes, unrealizedPnl: 4 }, prices, () => 0.99)
    expect(intent).toMatchObject({
      side: 'SELL_YES',
      action: 'sell',
      exit: 'tp',
      cost: 18,
    })
  })

  test('stops out a loser even when the wallet would rather buy', () => {
    const intent = pickIntent(yesWallet, { ...longYes, unrealizedPnl: -4 }, prices, () => 0.99)
    expect(intent).toMatchObject({
      side: 'SELL_YES',
      action: 'sell',
      exit: 'sl',
      cost: 18,
    })
  })
})

describe('exitReason', () => {
  test('fires at a 12 percent move and stays put inside the band', () => {
    expect(exitReason(2.4, 18)).toBe('tp')
    expect(exitReason(-2.4, 18)).toBe('sl')
    expect(exitReason(1, 18)).toBeNull()
  })
})

describe('pickExitIntent', () => {
  test('closes the open side that crossed the stop', () => {
    const intent = pickExitIntent({ yes: 0, no: 40, collateral: 40, unrealizedPnl: -6 }, prices)
    expect(intent).toMatchObject({ outcome: 'NO', exit: 'sl', cost: 16 })
  })
})

describe('assertTradeCost', () => {
  test('lets an exit sell the full position above the usual cap', () => {
    expect(() =>
      assertTradeCost({ side: 'SELL_YES', outcome: 'YES', action: 'sell', cost: 40, exit: 'tp' }),
    ).not.toThrow()
    expect(() => assertTradeCost({ side: 'BUY_YES', outcome: 'YES', action: 'buy', cost: 40 })).toThrow(
      'at most 5',
    )
  })
})
