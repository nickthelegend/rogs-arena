/**
 * MG-03/MG-04/MG-05 on devnet: badges reach Solana through a MagicBlock Magic Action.
 *   MG-03 commit_player_badges on the ER commits the Player, and the post-commit action
 *         record_badges updates the owner's BadgeRecord on Solana to the ER Player's stats
 *   MG-04 record_badges sent directly by a wallet is rejected (escrow signer check), record unchanged
 *   MG-05 GetCommitmentSignature (MagicBlock JS SDK) resolves the base-layer commit of the ER tx,
 *         and that base transaction ran record_badges successfully
 * Usage: bun run packages/arena-sdk/scripts/verify-badge-action.ts
 */
import { appendFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import {
  DELEGATION_PROGRAM_ID,
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  MARKETS,
  OUTCOME_YES,
  PROGRAM_ID,
  ROUND_OPEN,
  TRADE_LOCK_SECONDS,
  USD,
  badgeRecordPda,
  commitmentSignature,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  explorerTxUrl,
  fetchArena,
  fetchBadgeRecord,
  fetchPlayer,
  keypairSigner,
  playerPda,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const c = createConnections(DEVNET_ENDPOINTS)
const ix = new ArenaInstructions(c.base)
const now = () => Math.floor(Date.now() / 1000)
const rows: string[] = []
let failures = 0
const record = (id: string, check: string, ok: boolean, detail: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}: ${detail}`)
  rows.push(`| ${id} | ${check} | ${ok ? 'PASS' : 'FAIL'} | ${detail} |`)
}

const deployer = loadKeypair('deployer')
const owner = Keypair.generate()
const wallet = keypairSigner(owner)
await sendBaseTransaction(
  c.base,
  [SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })],
  keypairSigner(deployer),
)
await ensurePlayerDelegated(c, ix, wallet)
const session = await createSessionKey(c, ix, wallet, 1)
await sendErTransaction(c.er, [await ix.claimChips(session.keypair.publicKey, owner.publicKey, session.token)], session.keypair)

// One real trade so the committed stats are not all zero: buy on the first market with time left.
let traded = ''
for (const market of MARKETS) {
  const arena = await fetchArena(c.er, PROGRAM_ID, market.id)
  if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() <= TRADE_LOCK_SECONDS + 3) continue
  const buy = await ix.buy(session.keypair.publicKey, owner.publicKey, OUTCOME_YES, 5n * USD, 0n, 0, session.token, market.id)
  const sent = await sendErTransaction(c.er, [buy], session.keypair)
  traded = `${market.symbol} buy ${sent.signature}`
  break
}
const erPlayer = (await fetchPlayer(c.er, owner.publicKey))!
console.log(`owner ${owner.publicKey.toBase58()} ER stats: trades ${erPlayer.tradesTotal}, badges ${erPlayer.badges}, best streak ${erPlayer.bestStreak} (${traded || 'no open market to trade'})`)

const init = await sendBaseTransaction(c.base, [await ix.initBadgeRecord(owner.publicKey)], wallet)
const before = (await fetchBadgeRecord(c.base, owner.publicKey))!
console.log(`init_badge_record ${explorerTxUrl(init.signature, 'base')}: updates ${before.updates}, trades ${before.tradesTotal}`)

// MG-04 first, while the record is still untouched: a wallet cannot fake the action.
const escrow = PublicKey.findProgramAddressSync([Buffer.from('balance'), owner.publicKey.toBuffer(), Uint8Array.of(255)], DELEGATION_PROGRAM_ID)[0]
try {
  const direct = (await (ix.program.methods as any)
    .recordBadges()
    .accountsPartial({ badgeRecord: badgeRecordPda(owner.publicKey), player: playerPda(owner.publicKey), sourceProgram: PROGRAM_ID, escrowAuth: owner.publicKey, escrow })
    .instruction()) as TransactionInstruction
  // A wallet can't sign for the escrow PDA, so send it unsigned and let the program's signer check decide.
  direct.keys = direct.keys.map((key) => (key.pubkey.equals(escrow) ? { ...key, isSigner: false } : key))
  await sendBaseTransaction(c.base, [direct], wallet)
  record('MG-04', 'record_badges called directly by the owner wallet', false, 'transaction unexpectedly succeeded')
} catch (error) {
  const text = error instanceof Error ? error.message : String(error)
  const after = (await fetchBadgeRecord(c.base, owner.publicKey))!
  record('MG-04', 'record_badges called directly by the owner wallet', after.updates === before.updates && /signer constraint/i.test(text), `rejected on-chain: "${text.slice(0, 140)}"; updates still ${after.updates}`)
}

// MG-03: commit on the ER with the post-commit action.
const commit = await sendErTransaction(c.er, [await ix.commitPlayerBadges(owner.publicKey)], owner)
console.log(`commit_player_badges on the ER ${explorerTxUrl(commit.signature, 'er')} in ${Math.round(commit.ms)} ms`)
const recorded = await waitFor(
  async () => {
    const state = await fetchBadgeRecord(c.base, owner.publicKey)
    return state && state.updates > before.updates ? state : null
  },
  { timeoutMs: 120_000, intervalMs: 2_000, label: 'BadgeRecord update on Solana' },
).catch(() => null)
record(
  'MG-03',
  'post-commit Magic Action wrote the badge record on Solana',
  Boolean(recorded && recorded.tradesTotal === erPlayer.tradesTotal && recorded.badges === erPlayer.badges && recorded.bestStreak === erPlayer.bestStreak),
  recorded
    ? `updates ${before.updates} -> ${recorded.updates}; trades ${recorded.tradesTotal} (ER ${erPlayer.tradesTotal}), badges ${recorded.badges} (ER ${erPlayer.badges}), best streak ${recorded.bestStreak}; ER tx ${commit.signature}`
    : `BadgeRecord did not change within 120 s after ER tx ${commit.signature}`,
)

// MG-05: resolve the base commit with the MagicBlock SDK and confirm it ran the action.
try {
  const baseSig = await commitmentSignature(c.er, commit.signature)
  const baseTx = await waitFor(
    async () => c.base.getTransaction(baseSig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
    { timeoutMs: 60_000, intervalMs: 2_000, label: 'base commit transaction' },
  )
  const logs = baseTx.meta?.logMessages ?? []
  const ranAction = logs.some((line) => line.includes('Instruction: RecordBadges'))
  record(
    'MG-05',
    'GetCommitmentSignature resolves the base commit that ran record_badges',
    !baseTx.meta?.err && ranAction,
    `base sig ${baseSig} (${explorerTxUrl(baseSig, 'base')}); err ${JSON.stringify(baseTx.meta?.err ?? null)}; RecordBadges in logs: ${ranAction}`,
  )
} catch (error) {
  record('MG-05', 'GetCommitmentSignature resolves the base commit that ran record_badges', false, error instanceof Error ? error.message : String(error))
}

appendFileSync(
  new URL('../../../docs/TEST-RUN-CHAIN.md', import.meta.url),
  ['', '## Badges via Magic Action', '', `Run at ${new Date().toISOString()}, owner ${owner.publicKey.toBase58()}.`, '', '| Plan ID | Check | Result | Observed |', '|---|---|---|---|', ...rows, ''].join('\n'),
)
console.log(failures ? `BADGE ACTION FAILED: ${failures}` : 'BADGE ACTION PASSED')
process.exit(failures ? 1 : 0)
