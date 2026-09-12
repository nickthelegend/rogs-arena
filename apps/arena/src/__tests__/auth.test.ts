import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import {
  createNonce,
  NONCE_TTL_MS,
  SESSION_TTL_MS,
  signInMessage,
  verifyLogin,
  verifyWalletSignature,
  walletForToken,
} from '../auth'
import { openTestDb, type TestDatabase } from './helpers'

let db: TestDatabase

beforeAll(async () => {
  db = await openTestDb()
})

afterAll(async () => {
  await db.drop()
})

const sign = (keypair: Keypair, message: string) =>
  bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey))

describe('wallet signature auth (real ed25519, real Mongo)', () => {
  test('nonce message has the exact documented format', async () => {
    const wallet = Keypair.generate().publicKey.toBase58()
    const { nonce, message } = await createNonce(db.cols, wallet)
    expect(message).toBe(`Rogs Arena sign-in\nwallet: ${wallet}\nnonce: ${nonce}`)
    expect(signInMessage(wallet, nonce)).toBe(message)
  })

  test('a valid signature returns a 24h token that resolves to the wallet', async () => {
    const keypair = Keypair.generate()
    const wallet = keypair.publicKey.toBase58()
    const now = Date.now()
    const { message } = await createNonce(db.cols, wallet, now)
    const session = await verifyLogin(db.cols, wallet, sign(keypair, message), now)
    expect(session.wallet).toBe(wallet)
    expect(session.expiresAt).toBe(now + SESSION_TTL_MS)
    expect(bs58.decode(session.token).length).toBe(32)
    expect(await walletForToken(db.cols, session.token, now)).toBe(wallet)
    expect(await walletForToken(db.cols, session.token, now + SESSION_TTL_MS + 1)).toBeNull()
    expect(await walletForToken(db.cols, 'not-a-token', now)).toBeNull()
  })

  test('a nonce is single use', async () => {
    const keypair = Keypair.generate()
    const wallet = keypair.publicKey.toBase58()
    const { message } = await createNonce(db.cols, wallet)
    const signature = sign(keypair, message)
    await verifyLogin(db.cols, wallet, signature)
    expect(verifyLogin(db.cols, wallet, signature)).rejects.toThrow('No active nonce for this wallet; request a new one')
  })

  test('a signature from a different wallet is rejected', async () => {
    const victim = Keypair.generate()
    const attacker = Keypair.generate()
    const wallet = victim.publicKey.toBase58()
    const { message } = await createNonce(db.cols, wallet)
    expect(verifyWalletSignature(wallet, message, sign(attacker, message))).toBe(false)
    expect(verifyLogin(db.cols, wallet, sign(attacker, message))).rejects.toThrow('Invalid signature')
    // The nonce survives a failed attempt, so the real owner can still sign in.
    const session = await verifyLogin(db.cols, wallet, sign(victim, message))
    expect(session.wallet).toBe(wallet)
  })

  test('tampered, malformed and wrong-message signatures are rejected', async () => {
    const keypair = Keypair.generate()
    const wallet = keypair.publicKey.toBase58()
    const { message } = await createNonce(db.cols, wallet)
    const good = bs58.decode(sign(keypair, message))
    const tampered = Uint8Array.from(good)
    tampered[0] = (tampered[0] ?? 0) ^ 0xff
    expect(verifyWalletSignature(wallet, message, bs58.encode(tampered))).toBe(false)
    expect(verifyWalletSignature(wallet, message, 'not base58 0OIl')).toBe(false)
    expect(verifyWalletSignature(wallet, message, bs58.encode(good.slice(0, 63)))).toBe(false)
    expect(verifyWalletSignature(wallet, message, sign(keypair, `${message} `))).toBe(false)
    expect(verifyLogin(db.cols, wallet, bs58.encode(tampered))).rejects.toThrow('Invalid signature')
  })

  test('an expired nonce is rejected', async () => {
    const keypair = Keypair.generate()
    const wallet = keypair.publicKey.toBase58()
    const now = Date.now()
    const { message } = await createNonce(db.cols, wallet, now)
    expect(verifyLogin(db.cols, wallet, sign(keypair, message), now + NONCE_TTL_MS + 1)).rejects.toThrow(
      'No active nonce for this wallet; request a new one',
    )
  })
})
