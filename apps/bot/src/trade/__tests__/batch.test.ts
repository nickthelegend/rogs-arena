import { describe, expect, test } from 'bun:test'
import type { BotWallet } from '../../wallets.ts'
import { pickBatch, pickBatchSize } from '../batch.ts'

function wallet(index: number): BotWallet {
  const address = `0x${index.toString(16).padStart(40, '0')}` as `0x${string}`
  return { index, address, privateKey: '0x01', account: { address } } as BotWallet
}

describe('pickBatchSize', () => {
  test('picks 1 through the cap', () => {
    expect(pickBatchSize(4, () => 0)).toBe(1)
    expect(pickBatchSize(4, () => 0.99)).toBe(4)
    expect(pickBatchSize(1, () => 0.5)).toBe(1)
    expect(pickBatchSize(40, () => 0.99)).toBe(12)
  })
})

describe('pickBatch', () => {
  test('returns unique wallets and can pin the last one', () => {
    const roster = [wallet(0), wallet(1), wallet(2), wallet(3), wallet(4)]
    const last = roster[1]
    const group = pickBatch(roster, 3, last, true)

    expect(group[0]).toBe(last)
    expect(new Set(group.map((item) => item.address)).size).toBe(group.length)
    expect(group.length).toBe(3)
  })

  test('caps the batch at the roster size', () => {
    const roster = [wallet(0), wallet(1)]
    expect(pickBatch(roster, 8)).toHaveLength(2)
  })
})
