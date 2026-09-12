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
})

describe('getAvatar', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678'

  test('hashes an address to a local avatar url', () => {
    expect(getAvatar(address)).toMatch(/^\/avatars\/[0-9a-f]{6}\.png$/)
  })

  test('is stable and case-insensitive', () => {
    expect(getAvatar(address.toUpperCase())).toBe(getAvatar(address))
  })

  test('picks different avatars for different addresses', () => {
    expect(getAvatar('0x0000000000000000000000000000000000000001')).not.toBe(getAvatar(address))
  })
})

describe('getFrame', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678'

  test('hashes an address to a local frame url', () => {
    expect(getFrame(address)).toMatch(/^\/frames\/[0-9a-f]{6}\.png$/)
  })

  test('is stable and case-insensitive', () => {
    expect(getFrame(address.toUpperCase())).toBe(getFrame(address))
  })
})
