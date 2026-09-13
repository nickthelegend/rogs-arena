import { describe, expect, test } from 'bun:test'
import { PublicKey } from '@solana/web3.js'
import type { BadgeRecordState } from '@rogs/arena-sdk'
import { badgeRecordSummary, countBadges } from '@/lib/badge-record'

const record = (overrides: Partial<BadgeRecordState>): BadgeRecordState => ({
  address: PublicKey.default,
  owner: PublicKey.default,
  badges: 0,
  bestStreak: 0,
  calmWins: 0,
  tradesTotal: 0,
  winsTotal: 0,
  updates: 0,
  updatedTs: 0,
  ...overrides,
})

describe('badge record summary', () => {
  test('counts badge bits', () => {
    expect(countBadges(0)).toBe(0)
    expect(countBadges(0b1011)).toBe(3)
    expect(countBadges(0xffffffff)).toBe(32)
  })

  test('describes a missing record and a saved one', () => {
    expect(badgeRecordSummary(null)).toBe('Badges not saved on Solana yet')
    expect(badgeRecordSummary(record({ badges: 0b0001, bestStreak: 3, updates: 1 }))).toBe('On Solana: 1 badge · best streak 3 · 1 save')
    expect(badgeRecordSummary(record({ badges: 0b0110, bestStreak: 5, updates: 4 }))).toBe('On Solana: 2 badges · best streak 5 · 4 saves')
  })
})
