import { describe, expect, test } from 'bun:test'
import { getAvatar, getFrame } from '../avatar'
import { sanitizeName } from '../utils'

describe('sanitizeName', () => {
  test('lowercases, strips whitespace, and caps at 15 characters', () => {
    expect(sanitizeName('Nova')).toBe('nova')
    expect(sanitizeName('John Doe')).toBe('johndoe')
    expect(sanitizeName('  Ada  Lovelace  ')).toBe('adalovelace')
    expect(sanitizeName('Someone With A Very Long Name')).toBe('someonewithaver')
  })

  test('keeps only characters the arena profile API accepts', () => {
    expect(sanitizeName('<script>')).toBe('script')
    expect(sanitizeName('nick_the.legend-1')).toBe('nick_the.legend')
    expect(sanitizeName('zoë!@#7')).toBe('zoë7')
    expect(sanitizeName('🔥')).toBe('')
  })
})

describe('getAvatar', () => {
  const address = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'

  test('hashes an address to a local avatar url', () => {
    expect(getAvatar(address)).toMatch(/^\/avatars\/[0-9a-f]{6}\.png$/)
  })

  test('is stable for the same base58 address', () => {
    expect(getAvatar(address)).toBe(getAvatar(address))
    expect(getAvatar(` ${address} `)).toBe(getAvatar(address))
  })

  test('picks different avatars for different addresses', () => {
    expect(getAvatar('71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr')).not.toBe(getAvatar(address))
  })
})

describe('getFrame', () => {
  const address = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'

  test('hashes an address to a local frame url', () => {
    expect(getFrame(address)).toMatch(/^\/frames\/[0-9a-f]{6}\.png$/)
  })

  test('is stable for the same base58 address', () => {
    expect(getFrame(address)).toBe(getFrame(address))
  })
})
