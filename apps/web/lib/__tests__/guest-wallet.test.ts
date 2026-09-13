import { describe, expect, test } from 'bun:test'
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { GUEST_STORAGE_KEY, loadGuestWallet, loadOrCreateGuestWallet } from '../guest-wallet'

function memoryStorage(initial: Record<string, string> = {}) {
  const memory = new Map(Object.entries(initial))
  return {
    memory,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  }
}

describe('guest wallet', () => {
  test('creates one key and keeps returning it', () => {
    const storage = memoryStorage()

    expect(loadGuestWallet(storage)).toBeNull()
    const created = loadOrCreateGuestWallet(storage)
    const again = loadOrCreateGuestWallet(storage)

    expect(storage.memory.has(GUEST_STORAGE_KEY)).toBe(true)
    expect(again.publicKey.toBase58()).toBe(created.publicKey.toBase58())
    expect(loadGuestWallet(storage)?.publicKey.toBase58()).toBe(created.publicKey.toBase58())
  })

  test('signs messages with a verifiable ed25519 signature', async () => {
    const guest = loadOrCreateGuestWallet(memoryStorage())
    const message = new TextEncoder().encode('Rogs Arena sign-in')
    const signature = await guest.signMessage(message)

    expect(signature).toHaveLength(64)
    expect(nacl.sign.detached.verify(message, signature, guest.publicKey.toBytes())).toBe(true)
  })

  test('signs a transaction as its fee payer', async () => {
    const guest = loadOrCreateGuestWallet(memoryStorage())
    const transaction = new Transaction({
      feePayer: guest.publicKey,
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 1,
    }).add(SystemProgram.transfer({ fromPubkey: guest.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }))

    const [signed] = await guest.signAllTransactions([transaction])

    expect(signed?.verifySignatures()).toBe(true)
  })

  test('reports an unreadable saved key instead of replacing it', () => {
    const storage = memoryStorage({ [GUEST_STORAGE_KEY]: 'not-base58-0OIl' })

    expect(() => loadOrCreateGuestWallet(storage)).toThrow('not valid base58')
    expect(storage.memory.get(GUEST_STORAGE_KEY)).toBe('not-base58-0OIl')
  })
})
