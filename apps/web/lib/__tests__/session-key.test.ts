import { describe, expect, test } from 'bun:test'
import { PROGRAM_ID, sessionTokenPda } from '@rogs/arena-sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  parseStoredSession,
  readStoredSession,
  serializeSession,
  sessionStorageKey,
  SESSION_REFRESH_MARGIN_SECONDS,
  writeStoredSession,
  type ArenaSession,
} from '../session-key'

const now = 1_800_000_000

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

function session(owner: Keypair, validUntil = now + 86_400): ArenaSession {
  const keypair = Keypair.generate()
  const token = new PublicKey(sessionTokenPda(keypair.publicKey, owner.publicKey, PROGRAM_ID).toBase58())
  return { keypair, validUntil, token }
}

describe('stored session keys', () => {
  test('round-trip the session keypair and token for its wallet', () => {
    const owner = Keypair.generate()
    const wallet = owner.publicKey.toBase58()
    const storage = memoryStorage()
    const created = session(owner)

    writeStoredSession(wallet, created, storage)
    const restored = readStoredSession(wallet, PROGRAM_ID, storage, now)

    expect(restored?.keypair.publicKey.toBase58()).toBe(created.keypair.publicKey.toBase58())
    expect(restored?.token.toBase58()).toBe(created.token.toBase58())
    expect(restored?.validUntil).toBe(created.validUntil)
  })

  test('rejects a token that was not derived for this wallet', () => {
    const owner = Keypair.generate()
    const other = Keypair.generate()
    const raw = serializeSession(owner.publicKey.toBase58(), session(other))

    expect(parseStoredSession(raw, owner.publicKey.toBase58(), PROGRAM_ID, now)).toBeNull()
  })

  test('drops a session that expires within five minutes', () => {
    const owner = Keypair.generate()
    const wallet = owner.publicKey.toBase58()
    const storage = memoryStorage()

    writeStoredSession(wallet, session(owner, now + SESSION_REFRESH_MARGIN_SECONDS - 1), storage)

    expect(readStoredSession(wallet, PROGRAM_ID, storage, now)).toBeNull()
    expect(storage.memory.has(sessionStorageKey(wallet))).toBe(false)
  })
})
