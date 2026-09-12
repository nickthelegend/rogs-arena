import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import { CHAT_RATE_LIMIT_ERROR, listChat, postChat } from '../chat'
import {
  completeFaucet,
  FAUCET_IP_LIMIT_ERROR,
  FAUCET_LAMPORTS,
  FAUCET_WALLET_LIMIT_ERROR,
  FAUCET_WINDOW_MS,
  releaseFaucet,
  reserveFaucet,
} from '../faucet'
import { openTestDb, type TestDatabase } from './helpers'

let db: TestDatabase

beforeAll(async () => {
  db = await openTestDb()
})

afterAll(async () => {
  await db.drop()
})

const newWallet = () => Keypair.generate().publicKey.toBase58()

describe('chat rate limit (real Mongo)', () => {
  test('1 message per second per wallet, persisted before returning', async () => {
    const wallet = newWallet()
    let now = 1_800_000_000_000
    const clock = () => now

    const first = await postChat(db.cols, { wallet, name: 'tester', message: 'gm' }, clock)
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.chat).toMatchObject({ address: wallet, name: 'tester', message: 'gm', t: now })
      expect(first.chat.id).toMatch(/^[0-9a-f]{24}$/)
    }

    now += 999
    expect(await postChat(db.cols, { wallet, name: 'tester', message: 'too fast' }, clock)).toEqual({
      ok: false,
      error: CHAT_RATE_LIMIT_ERROR,
    })
    expect((await postChat(db.cols, { wallet: newWallet(), name: 'other', message: 'hi' }, clock)).ok).toBe(true)

    now += 2
    expect((await postChat(db.cols, { wallet, name: 'tester', message: 'ok now' }, clock)).ok).toBe(true)
    expect(await db.cols.chat.countDocuments({ address: wallet })).toBe(2)
    const recent = await listChat(db.cols, 50)
    expect(recent.filter(chat => chat.address === wallet).map(chat => chat.message)).toEqual(['gm', 'ok now'])
  })

  test('concurrent messages from one wallet cannot both pass', async () => {
    const wallet = newWallet()
    const now = 1_800_000_100_000
    const results = await Promise.all(
      ['a', 'b', 'c'].map(message => postChat(db.cols, { wallet, name: 'racer', message }, () => now)),
    )
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(await db.cols.chat.countDocuments({ address: wallet })).toBe(1)
  })
})

describe('faucet limits (real Mongo)', () => {
  test('1 request per wallet per 24h', async () => {
    const wallet = newWallet()
    const ip = '203.0.113.7'
    const now = 1_800_000_000_000

    const first = await reserveFaucet(db.cols, wallet, ip, now)
    expect(first.ok).toBe(true)
    if (first.ok) await completeFaucet(db.cols, first.id, 'test-signature', FAUCET_LAMPORTS)

    expect(await reserveFaucet(db.cols, wallet, ip, now + 60 * 60_000)).toEqual({ ok: false, error: FAUCET_WALLET_LIMIT_ERROR })
    expect(await db.cols.faucet.countDocuments({ wallet })).toBe(1)
    expect((await reserveFaucet(db.cols, wallet, ip, now + FAUCET_WINDOW_MS + 1)).ok).toBe(true)
  })

  test('5 requests per IP per 24h', async () => {
    const ip = '198.51.100.23'
    const now = 1_800_000_000_000
    for (let i = 0; i < 5; i += 1) {
      expect((await reserveFaucet(db.cols, newWallet(), ip, now + i)).ok).toBe(true)
    }
    expect(await reserveFaucet(db.cols, newWallet(), ip, now + 10)).toEqual({ ok: false, error: FAUCET_IP_LIMIT_ERROR })
    expect(await db.cols.faucet.countDocuments({ ip })).toBe(5)
    expect((await reserveFaucet(db.cols, newWallet(), ip, now + FAUCET_WINDOW_MS + 5)).ok).toBe(true)
  })

  test('a released reservation (failed transfer) does not count', async () => {
    const wallet = newWallet()
    const ip = '192.0.2.44'
    const now = 1_800_000_000_000
    const first = await reserveFaucet(db.cols, wallet, ip, now)
    if (!first.ok) throw new Error('expected the first reservation to succeed')
    await releaseFaucet(db.cols, first.id)
    expect((await reserveFaucet(db.cols, wallet, ip, now + 1)).ok).toBe(true)
  })
})
