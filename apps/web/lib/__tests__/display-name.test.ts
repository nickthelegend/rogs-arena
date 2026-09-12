import { describe, expect, test } from 'bun:test'
import {
  DISPLAY_NAME_STORAGE_KEY,
  parseDisplayNames,
  readDisplayName,
  resolveDisplayName,
  writeDisplayName,
} from '../display-name'

function memoryStorage(initial: Record<string, string> = {}) {
  const memory = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  }
}

describe('parseDisplayNames', () => {
  test('keeps sanitized names keyed by lowercase address', () => {
    expect(
      parseDisplayNames({
        '0xAbC': 'Nova Pulse',
        '0xdef': '   ',
        '0x123': 12,
      }),
    ).toEqual({
      '0xabc': 'novapulse',
    })
  })
})

describe('display name storage', () => {
  test('reads and writes a sanitized name for an address', () => {
    const storage = memoryStorage()
    const address = '0x1111111111111111111111111111111111111111'

    expect(readDisplayName(address, storage)).toBeNull()
    writeDisplayName(address, 'John Doe', storage)
    expect(readDisplayName(address, storage)).toBe('johndoe')
    expect(readDisplayName(address.toUpperCase(), storage)).toBe('johndoe')
    expect(JSON.parse(storage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '{}')).toEqual({
      [address]: 'johndoe',
    })
  })

  test('ignores empty names and falls back to a sanitized default', () => {
    const storage = memoryStorage()
    const address = '0x2222222222222222222222222222222222222222'

    writeDisplayName(address, '   ', storage)
    expect(readDisplayName(address, storage)).toBeNull()
    expect(resolveDisplayName(address, 'Trader', storage)).toBe('trader')
  })
})
