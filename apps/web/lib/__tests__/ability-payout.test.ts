import { describe, expect, test } from 'bun:test'
import {
  abilityPayoutPlan,
  abilityWon,
  capUsd,
  closeProfitUsd,
  formatAbilitySettlement,
  pickCheersRecipients,
  playerBonusUsd,
  settlementProfitUsd,
} from '../ability-payout'

describe('closeProfitUsd', () => {
  test('subtracts the sold cost basis from proceeds', () => {
    expect(closeProfitUsd({ stakeAmount: 5, shares: 10, soldShares: 10, proceeds: 8 })).toBe(3)
    expect(closeProfitUsd({ stakeAmount: 5, shares: 10, soldShares: 5, proceeds: 2 })).toBe(-0.5)
  })
})

describe('settlementProfitUsd', () => {
  test('treats a winning share as a dollar and a loss as the stake', () => {
    expect(settlementProfitUsd({ won: true, stakeAmount: 5, shares: 8.25 })).toBe(3.25)
    expect(settlementProfitUsd({ won: false, stakeAmount: 5, shares: 8.25 })).toBe(-5)
  })
})

describe('playerBonusUsd', () => {
  test('doubles a win up to $10 and refunds a loss up to $10', () => {
    expect(playerBonusUsd('double_win', true, 4.2)).toBe(4.2)
    expect(playerBonusUsd('double_win', true, 18)).toBe(10)
    expect(playerBonusUsd('double_win', false, -4)).toBe(0)
    expect(playerBonusUsd('protect_loss', false, -4)).toBe(4)
    expect(playerBonusUsd('protect_loss', false, -40)).toBe(10)
    expect(playerBonusUsd('protect_loss', true, 4)).toBe(0)
  })

  test('pays a flat $10 on the next calm-pulse win', () => {
    expect(playerBonusUsd('calm_pulse', true, 1)).toBe(10)
    expect(playerBonusUsd('calm_pulse', false, -3)).toBe(0)
    expect(playerBonusUsd('cheers_win', true, 6)).toBe(0)
  })

  test('does not pay on a scratch', () => {
    expect(abilityWon(0)).toBeNull()
    expect(playerBonusUsd('double_win', null, 0)).toBe(0)
    expect(capUsd(-2)).toBe(0)
  })
})

describe('abilityPayoutPlan', () => {
  test('cheers pays ten other traders a dollar and nothing to the winner', () => {
    expect(abilityPayoutPlan('cheers_win', true, 7)).toEqual({
      playerUsd: 0,
      cheersUsd: 1,
      cheersCount: 10,
    })
    expect(abilityPayoutPlan('cheers_win', false, -7)).toEqual({
      playerUsd: 0,
      cheersUsd: 0,
      cheersCount: 0,
    })
  })
})

describe('pickCheersRecipients', () => {
  test('excludes the winner, dedupes exact addresses, and caps at ten', () => {
    const winner = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
    const addresses = [
      winner,
      winner,
      '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
      '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
      'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu',
      'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57',
      'J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q',
      'PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd',
      'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh',
      'KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5',
      'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz',
      '5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc',
      'Magic11111111111111111111111111111111111111',
      'MagicContext1111111111111111111111111111111',
    ]
    const picked = pickCheersRecipients(addresses, winner, 10, () => 0)
    expect(picked).toHaveLength(10)
    expect(picked).not.toContain(winner)
    expect(new Set(picked).size).toBe(10)
  })

  test('treats base58 addresses that differ only by case as different traders', () => {
    const winner = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
    expect(pickCheersRecipients([winner.toLowerCase(), winner], winner, 10, () => 0)).toEqual([winner.toLowerCase()])
  })
})

describe('formatAbilitySettlement', () => {
  test('describes cheers and player bonuses', () => {
    expect(
      formatAbilitySettlement({
        kind: 'cheers_win',
        status: 'paid',
        won: true,
        profit: 3,
        playerUsd: 0,
        recipientCount: 10,
      }),
    ).toBe('Cheers sent $1 to 10 traders.')
    expect(
      formatAbilitySettlement({
        kind: 'double_win',
        status: 'paid',
        won: true,
        profit: 4,
        playerUsd: 4,
        recipientCount: 0,
      }),
    ).toBe('Ability paid $4.00.')
  })
})
