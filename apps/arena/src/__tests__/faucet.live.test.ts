import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import { ArenaChain } from '../chain'
import { env } from '../env'
import { FAUCET_LAMPORTS, requestFaucet } from '../faucet'
import { sleep } from '../util'
import { openTestDb, type TestDatabase } from './helpers'

let db: TestDatabase
const chain = new ArenaChain(env)

beforeAll(async () => {
  db = await openTestDb()
})

afterAll(async () => {
  await db.drop()
})

describe('faucet on devnet (live)', () => {
  test('sends 0.02 SOL to a fresh keypair, then skips it as funded', async () => {
    const recipient = Keypair.generate().publicKey
    const wallet = recipient.toBase58()
    const result = await requestFaucet(db.cols, chain, wallet, `live-test-${Date.now()}`)
    if (!('signature' in result)) throw new Error(`expected a transfer, got ${JSON.stringify(result)}`)
    expect(result.lamports).toBe(FAUCET_LAMPORTS)
    console.log(`[live] faucet signature ${result.signature}`)

    let balance = 0
    for (let attempt = 0; attempt < 30 && balance === 0; attempt += 1) {
      balance = await chain.base.getBalance(recipient, 'confirmed')
      if (balance === 0) await sleep(1_000)
    }
    expect(balance).toBe(20_000_000)

    const record = await db.cols.faucet.findOne({ wallet })
    expect(record).toMatchObject({ status: 'sent', signature: result.signature, lamports: 20_000_000 })

    expect(await requestFaucet(db.cols, chain, wallet, 'live-test-second')).toEqual({ skipped: true, balance: 20_000_000 })
  }, 120_000)
})
