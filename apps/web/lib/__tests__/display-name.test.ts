import { describe, expect, test } from 'bun:test'
import {
  DISPLAY_NAME_STORAGE_KEY,
  parseDisplayNames,
  readDisplayName,
  resolveDisplayName,
  writeDisplayName,
} from '../display-name'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
const otherWallet = '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr'

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
  test('keeps sanitized names keyed by the exact base58 address', () => {
    expect(
      parseDisplayNames({
        [wallet]: 'Nova Pulse',
        [otherWallet]: '   ',
        J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q: 12,
      }),
    ).toEqual({
      [wallet]: 'novapulse',
    })
  })
})

describe('display name storage', () => {
  test('reads and writes a sanitized name for an address', () => {
    const storage = memoryStorage()

    expect(readDisplayName(wallet, storage)).toBeNull()
    writeDisplayName(wallet, 'John Doe', storage)
    expect(readDisplayName(wallet, storage)).toBe('johndoe')
    expect(JSON.parse(storage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '{}')).toEqual({
      [wallet]: 'johndoe',
    })
  })

  test('treats a differently cased address as another wallet', () => {
    const storage = memoryStorage()

    writeDisplayName(wallet, 'Nova', storage)
    expect(readDisplayName(wallet.toLowerCase(), storage)).toBeNull()
    expect(readDisplayName(wallet.toUpperCase(), storage)).toBeNull()
  })

  test('ignores empty names and falls back to a sanitized default', () => {
    const storage = memoryStorage()

    writeDisplayName(otherWallet, '   ', storage)
    expect(readDisplayName(otherWallet, storage)).toBeNull()
    expect(resolveDisplayName(otherWallet, 'Trader', storage)).toBe('trader')
  })
})
