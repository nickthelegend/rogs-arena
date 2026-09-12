import { describe, expect, test } from 'bun:test'
import { closeKey, firebaseKey, traderKey } from '../firebase-path'

describe('firebaseKey', () => {
  test('strips firebase-forbidden characters without changing case', () => {
    expect(firebaseKey('100_1')).toBe('100_1')
    expect(firebaseKey('a/b.c#d$[e]')).toBe('a_b_c_d__e_')
  })
})

describe('traderKey', () => {
  test('lowercases and strips firebase-forbidden characters', () => {
    expect(traderKey('0xAbC.def#1$[x]/Y')).toBe('0xabc_def_1__x__y')
  })
})

describe('closeKey', () => {
  test('joins market, trader, and outcome into a firebase-safe id', () => {
    expect(closeKey('0xAb/C', '0xDeF', 'YES')).toBe('0xab_c_0xdef_YES')
  })
})
