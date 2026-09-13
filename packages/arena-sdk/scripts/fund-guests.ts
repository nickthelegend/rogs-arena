/**
 * Creates N disposable devnet guest wallets for browser test runs and funds them from the deployer, so
 * automated runs do not consume the arena faucet's per-IP allowance. A funded guest still goes through the
 * app's real setup (init + delegate, session key, claim chips); the faucet simply answers "skipped".
 *
 * Usage (from packages/arena-sdk): bun scripts/fund-guests.ts <count> <outFile>
 * The out file holds base58 secret keys of throwaway devnet wallets; keep it outside the repo.
 */
import { writeFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'
import bs58 from 'bs58'

import { DEVNET_ENDPOINTS, createConnections, explorerTxUrl, keypairSigner, sendBaseTransaction } from '../src/index'
import { loadKeypair } from './lib/keys'

const count = Number(process.argv[2] ?? 3)
const outFile = process.argv[3]
if (!outFile || !Number.isInteger(count) || count < 1 || count > 10) {
  console.error('usage: bun scripts/fund-guests.ts <count 1-10> <outFile>')
  process.exit(1)
}

const connections = createConnections(DEVNET_ENDPOINTS)
const deployer = loadKeypair('deployer')
const guests = Array.from({ length: count }, () => Keypair.generate())
const sent = await sendBaseTransaction(
  connections.base,
  guests.map((guest) => SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: guest.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL })),
  keypairSigner(deployer),
)
writeFileSync(outFile, JSON.stringify(guests.map((guest) => ({ publicKey: guest.publicKey.toBase58(), secretKey: bs58.encode(guest.secretKey) })), null, 1))
console.log(`funded ${count} guests with 0.03 SOL each: ${explorerTxUrl(sent.signature, 'base')}`)
console.log(guests.map((guest) => guest.publicKey.toBase58()).join('\n'))
process.exit(0)
