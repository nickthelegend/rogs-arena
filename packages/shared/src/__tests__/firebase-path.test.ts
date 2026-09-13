import { describe, expect, test } from 'bun:test'
import { closeKey, firebaseKey, traderKey } from '../firebase-path'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'

describe('firebaseKey', () => {
  test('strips firebase-forbidden characters without changing case', () => {
    expect(firebaseKey('100_1')).toBe('100_1')
    expect(firebaseKey('a/b.c#d$[e]')).toBe('a_b_c_d__e_')
  })
})

describe('traderKey', () => {
  test('keeps a base58 wallet exactly as written', () => {
    expect(traderKey(wallet)).toBe(wallet)
    expect(traderKey(wallet)).not.toBe(traderKey(wallet.toLowerCase()))
  })

  test('strips firebase-forbidden characters without lowercasing', () => {
    expect(traderKey('AbC.def#1$[x]/Y')).toBe('AbC_def_1__x__Y')
  })
})

describe('closeKey', () => {
  test('joins round, trader, and outcome into a case-preserving key', () => {
    expect(closeKey('42', wallet, 'YES')).toBe(`42_${wallet}_YES`)
    expect(closeKey('4/2', 'AbC', 'NO')).toBe('4_2_AbC_NO')
  })
})
