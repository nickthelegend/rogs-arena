import { describe, expect, test } from 'bun:test'
import { ABILITY_DOUBLE } from '@rogs/arena-sdk'
import { formatSettlementMessage, settlementSummaryFromDto } from '../trading'

describe('settlementSummaryFromDto', () => {
  test('keeps negative P/L from the indexed row (real round-15 keeper settlement)', () => {
    const summary = settlementSummaryFromDto({ roundId: 15, payout: 0, profit: -5, ability: 0, bonus: 0, calm: false, cheers: false })
    expect(summary.profit).toBe(-5_000_000n)
    expect(summary.payout).toBe(0n)
    expect(formatSettlementMessage([summary])).toStartWith('Settled 1 position: paid $0.00, P/L ')
  })

  test('carries ability bonuses exactly (real round-4 Double settlement)', () => {
    const summary = settlementSummaryFromDto({ roundId: 4, payout: 0, profit: 1.104787, ability: ABILITY_DOUBLE, bonus: 1.104787, calm: false, cheers: false })
    expect(summary.bonus).toBe(1_104_787n)
    expect(formatSettlementMessage([summary])).toContain('Double price paid $1.10.')
  })
})
