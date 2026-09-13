import { describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import {
  authStorageKey,
  expiresAtMs,
  parseStoredAuth,
  readStoredAuth,
  signInMessage,
  signInWithWallet,
  type ArenaAuthApi,
} from '../arena-auth'
import { guestWalletFromKeypair } from '../guest-wallet'

function memoryStorage() {
  const memory = new Map<string, string>()
  return {
    memory,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
  }
}

/** Verifies real ed25519 signatures the way the arena service does. */
function verifyingArena(expiresAt: number | string, message = signInMessage): ArenaAuthApi {
  const nonces = new Map<string, string>()
  return {
    async authNonce(wallet) {
      const nonce = `nonce-${nonces.size + 1}`
      nonces.set(wallet, nonce)
      return { nonce, message: message(wallet, nonce) }
    },
    async authVerify(wallet, signature) {
      const nonce = nonces.get(wallet)
      if (!nonce) throw new Error('Nonce expired')
      const verified = nacl.sign.detached.verify(
        new TextEncoder().encode(signInMessage(wallet, nonce)),
        bs58.decode(signature),
        bs58.decode(wallet),
      )
      if (!verified) throw new Error('Signature does not match the wallet')
      return { token: `token-for-${wallet}`, wallet, expiresAt }
    },
  }
}

describe('signInMessage', () => {
  test('matches the arena contract byte for byte', () => {
    expect(signInMessage('Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr', 'abc')).toBe(
      'Rogs Arena sign-in\nwallet: Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr\nnonce: abc',
    )
  })
})

describe('signInWithWallet', () => {
  test('signs the server message with the guest key and stores the token', async () => {
    const guest = guestWalletFromKeypair(Keypair.generate())
    const wallet = guest.publicKey.toBase58()
    const storage = memoryStorage()
    const expiresAt = Date.now() + 86_400_000

    const session = await signInWithWallet({
      wallet,
      signMessage: (message) => guest.signMessage(message),
      api: verifyingArena(expiresAt),
      storage,
    })

    expect(session).toEqual({ token: `token-for-${wallet}`, wallet, expiresAt })
    expect(readStoredAuth(wallet, storage)).toEqual(session)
    expect(storage.memory.has(authStorageKey(wallet))).toBe(true)
  })

  test('refuses to sign anything other than the sign-in message', async () => {
    const guest = guestWalletFromKeypair(Keypair.generate())
    const wallet = guest.publicKey.toBase58()

    await expect(
      signInWithWallet({
        wallet,
        signMessage: (message) => guest.signMessage(message),
        api: verifyingArena(Date.now() + 60_000_000, () => 'Transfer everything'),
        storage: memoryStorage(),
      }),
    ).rejects.toThrow('unexpected message')
  })

  test('explains when a wallet cannot sign messages', async () => {
    await expect(
      signInWithWallet({
        wallet: Keypair.generate().publicKey.toBase58(),
        signMessage: undefined,
        api: verifyingArena(Date.now() + 60_000_000),
        storage: memoryStorage(),
      }),
    ).rejects.toThrow('cannot sign messages')
  })
})

describe('stored auth', () => {
  const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
  const now = 1_800_000_000_000

  test('drops an expired or foreign token', () => {
    expect(parseStoredAuth(JSON.stringify({ token: 't', wallet, expiresAt: now - 1 }), wallet, now)).toBeNull()
    expect(
      parseStoredAuth(JSON.stringify({ token: 't', wallet: wallet.toLowerCase(), expiresAt: now + 86_400_000 }), wallet, now),
    ).toBeNull()
    expect(parseStoredAuth('not json', wallet, now)).toBeNull()
  })

  test('removes an unusable entry from storage', () => {
    const storage = memoryStorage()
    storage.setItem(authStorageKey(wallet), JSON.stringify({ token: 't', wallet, expiresAt: 1 }))

    expect(readStoredAuth(wallet, storage, now)).toBeNull()
    expect(storage.memory.has(authStorageKey(wallet))).toBe(false)
  })

  test('reads expiry as seconds, milliseconds, or ISO time', () => {
    expect(expiresAtMs(1_800_000_000)).toBe(1_800_000_000_000)
    expect(expiresAtMs(1_800_000_000_000)).toBe(1_800_000_000_000)
    expect(expiresAtMs('1800000000')).toBe(1_800_000_000_000)
    expect(expiresAtMs('2027-01-15T08:00:00.000Z')).toBe(Date.parse('2027-01-15T08:00:00.000Z'))
    expect(expiresAtMs('soon')).toBeNull()
  })
})
