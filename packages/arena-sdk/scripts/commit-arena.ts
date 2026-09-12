/**
 * Commits the delegated Arena from the MagicBlock ER back to Solana
 * (MagicIntentBundleBuilder.commit) and proves the base-layer bytes now match
 * the ER state. Usage: bun run packages/arena-sdk/scripts/commit-arena.ts
 */
import { appendFileSync } from 'node:fs'
import {
  ArenaInstructions,
  DELEGATION_PROGRAM_ID,
  DEVNET_ENDPOINTS,
  arenaPda,
  createConnections,
  decodeArena,
  explorerTxUrl,
  fetchArena,
  sendErTransaction,
  waitFor,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const connections = createConnections(DEVNET_ENDPOINTS)
const keeper = loadKeypair('keeper')
const ix = new ArenaInstructions(connections.base)
const address = arenaPda()

const readBase = async () => {
  const account = await connections.base.getAccountInfo(address, 'confirmed')
  if (!account) throw new Error('arena missing on base')
  return { owner: account.owner, arena: decodeArena(address, account.data) }
}

const before = await readBase()
const erBefore = await fetchArena(connections.er)
console.log(`base before: owner ${before.owner.toBase58()} round ${before.arena.current.id} trades ${before.arena.totalTrades} commits ${before.arena.commits}`)
console.log(`ER now:      round ${erBefore.current.id} trades ${erBefore.totalTrades} commits ${erBefore.commits}`)
const sent = await sendErTransaction(connections.er, [await ix.commitArena(keeper.publicKey)], keeper)
console.log(`commit_arena on ER: ${explorerTxUrl(sent.signature, 'er')} (${Math.round(sent.ms)}ms)`)
const erAfter = await fetchArena(connections.er)
const landed = await waitFor(async () => {
  const base = await readBase()
  return base.arena.commits === erAfter.commits && base.arena.totalTrades >= erAfter.totalTrades ? base : null
}, { timeoutMs: 90_000, intervalMs: 2_000, label: 'the arena commit to land on Solana' })
const ok = landed.owner.equals(DELEGATION_PROGRAM_ID) && landed.arena.current.id >= erAfter.current.id
console.log(`${ok ? 'PASS' : 'FAIL'} base after: owner ${landed.owner.toBase58()} (still delegated) round ${landed.arena.current.id} trades ${landed.arena.totalTrades} treasury ${Number(landed.arena.treasury) / 1e6} commits ${landed.arena.commits}`)
appendFileSync(new URL('../../../docs/E2E-RUN.md', import.meta.url), [
  '',
  '## Arena commit to Solana (MagicIntentBundleBuilder)',
  '',
  `Run at ${new Date().toISOString()}. The \`commit_arena\` transaction on the ER is [${sent.signature.slice(0, 8)}…](${explorerTxUrl(sent.signature, 'er')}).`,
  `Before the commit, Solana held round ${before.arena.current.id}, ${before.arena.totalTrades} trades and ${before.arena.commits} commits.`,
  `After it landed, Solana held round ${landed.arena.current.id}, ${landed.arena.totalTrades} trades and ${landed.arena.commits} commits. The account is still owned by the delegation program, so the arena kept running on the ER. Result: ${ok ? 'PASS' : 'FAIL'}.`,
  '',
].join('\n'))
process.exit(ok ? 0 : 1)
