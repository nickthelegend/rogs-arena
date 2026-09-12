import { describe, expect, test } from 'bun:test'
import {
  claimableOutcomes,
  formatClaimRow,
  formatPnl,
  formatPosition,
  settlementResult,
} from '../result.ts'

const ids = { yesId: 1n, noId: 2n }

describe('claimableOutcomes', () => {
  test('redeems both sides on a void', () => {
    expect(claimableOutcomes({ isVoided: true, isResolved: false, winningOutcome: 0, ...ids })).toEqual([
      { label: 'YES', index: 0, id: 1n },
      { label: 'NO', index: 1, id: 2n },
    ])
  })

  test('redeems only the winner on a resolved market', () => {
    expect(claimableOutcomes({ isVoided: false, isResolved: true, winningOutcome: 0, ...ids })).toEqual([
      { label: 'YES', index: 0, id: 1n },
    ])
    expect(claimableOutcomes({ isVoided: false, isResolved: true, winningOutcome: 1, ...ids })).toEqual([
      { label: 'NO', index: 1, id: 2n },
    ])
  })

  test('redeems nothing while the market is still open', () => {
    expect(claimableOutcomes({ isVoided: false, isResolved: false, winningOutcome: 0, ...ids })).toEqual([])
  })
})

describe('settlementResult', () => {
  test('marks void, pending, win, and lose', () => {
    expect(settlementResult({ isVoided: true, isResolved: false, winningOutcome: 0, yes: 2, no: 1 })).toBe('void')
    expect(settlementResult({ isVoided: false, isResolved: false, winningOutcome: 0, yes: 2, no: 0 })).toBe(
      'pending',
    )
    expect(settlementResult({ isVoided: false, isResolved: true, winningOutcome: 0, yes: 2, no: 0 })).toBe('win')
    expect(settlementResult({ isVoided: false, isResolved: true, winningOutcome: 0, yes: 0, no: 3 })).toBe('lose')
    expect(settlementResult({ isVoided: false, isResolved: true, winningOutcome: 1, no: 1, yes: 0 })).toBe('win')
  })
})

describe('formatPosition', () => {
  test('shows the held sides', () => {
    expect(formatPosition(8.2, 0)).toBe('YES 8.20')
    expect(formatPosition(0, 3.1)).toBe('NO 3.10')
    expect(formatPosition(2, 1)).toBe('YES 2.00 NO 1.00')
    expect(formatPosition(0, 0)).toBe('-')
  })
})

describe('formatPnl', () => {
  test('signs the number', () => {
    expect(formatPnl(2.1)).toBe('+2.10')
    expect(formatPnl(-3)).toBe('-3.00')
    expect(formatPnl(0)).toBe('0.00')
  })
})

describe('formatClaimRow', () => {
  test('prints wallet, position, result, claimed, amount, pnl', () => {
    expect(
      formatClaimRow({
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC-5m',
        position: 'YES 8.20',
        result: 'win',
        claimed: 'yes',
        amount: 8.12,
        pnl: 2.1,
      }),
    ).toContain('YES 8.20')
  })
})
