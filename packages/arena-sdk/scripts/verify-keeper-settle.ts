/**
 * Verifies the deployed keeper and indexer against real devnet activity (TEST-PLAN KPR-01, IDX-02).
 * No mocks: a fresh wallet trades on the MagicBlock ER and never sends settle_player itself.
 *
 * - IDX-02: when a flag file path is given, the buy waits until that file exists. The operator
 *   restarts the Railway service first, so the trade lands while the service is down and has to
 *   come back through the indexer backfill.
 * - KPR-01: after the MagicBlock crank resolves the round, the keeper must settle the position
 *   within 30 seconds, in a transaction signed by the keeper key.
 *
 * Usage (from packages/arena-sdk): bun scripts/verify-keeper-settle.ts [flagFile]
 */
import { appendFileSync, existsSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'

import {
  ABILITY_LOCK_SECONDS,
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  OUTCOME_YES,
  ROUND_OPEN,
  USD,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  explorerTxUrl,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  positionForRound,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const SERVICE = process.env.ARENA_URL ?? 'https://arena-production-0bdd.up.railway.app'
const KEEPER = '59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r'
const flag = process.argv[2]
const now = () => Math.floor(Date.now() / 1000)

type Row = { id: string; ok: boolean; detail: string; signature?: string }
const rows: Row[] = []
function record(row: Row) {
  rows.push(row)
  console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}${row.signature ? ` ${explorerTxUrl(row.signature, 'er')}` : ''}`)
}

const getJson = async (path: string) => {
  const res = await fetch(SERVICE + path, { signal: AbortSignal.timeout(5_000) })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json() as Promise<any>
}

async function main() {
  const connections = createConnections(DEVNET_ENDPOINTS)
  const instructions = new ArenaInstructions(connections.base)
  const deployer = loadKeypair('deployer')
  const owner = Keypair.generate()
  const wallet = keypairSigner(owner)

  await sendBaseTransaction(
    connections.base,
    [SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })],
    keypairSigner(deployer),
  )
  await ensurePlayerDelegated(connections, instructions, wallet)
  const session = await createSessionKey(connections, instructions, wallet, 1)
  await sendErTransaction(connections.er, [await instructions.claimChips(session.keypair.publicKey, owner.publicKey, session.token)], session.keypair)
  console.log(`player ${owner.publicKey.toBase58()} ready with chips`)

  // Leave room for a service restart before the buy and still trade before the ability lock.
  let arena = await fetchArena(connections.er)
  if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() < ABILITY_LOCK_SECONDS + 150) {
    const previous = arena.current.id
    console.log(`waiting for the next round (round ${previous} ends in ${arena.current.endTs - now()}s)`)
    arena = await waitFor(
      async () => {
        const next = await fetchArena(connections.er)
        return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
      },
      { timeoutMs: 400_000, intervalMs: 2_000, label: 'the next round' },
    )
  }
  const roundId = arena.current.id
  const endTs = arena.current.endTs

  if (flag) {
    console.log(`READY round ${roundId} ends in ${endTs - now()}s; waiting for ${flag}`)
    await waitFor(async () => existsSync(flag), { timeoutMs: 120_000, intervalMs: 250, label: 'the restart flag' })
  }
  // "Down" for IDX-02 means nothing was indexing: the service unreachable, or up with the indexer disabled.
  const serviceDown = await fetch(`${SERVICE}/health`, { signal: AbortSignal.timeout(4_000) })
    .then(async (res) => !res.ok || (await res.json() as any)?.indexer?.enabled === false)
    .catch(() => true)

  const buy = await sendErTransaction(
    connections.er,
    [await instructions.buy(session.keypair.publicKey, owner.publicKey, OUTCOME_YES, 5n * USD, 0n, 0, session.token)],
    session.keypair,
  )
  const boughtAt = Date.now()
  console.log(`bought YES $5 in round ${roundId} (service ${serviceDown ? 'down' : 'up'} at buy time): ${buy.signature}`)

  if (flag) {
    const indexed = await waitFor(
      async () => {
        const trades = await getJson(`/api/trades?roundId=${roundId}`).catch(() => null)
        return trades?.some((trade: any) => trade.sig === buy.signature) ? trades : null
      },
      { timeoutMs: 180_000, intervalMs: 2_000, label: 'the trade to appear in /api/trades' },
    )
    record({
      id: 'IDX-02',
      ok: serviceDown && Boolean(indexed),
      detail: `service was ${serviceDown ? 'down' : 'UP (restart window missed)'} when the buy landed; /api/trades returned it ${Math.round((Date.now() - boughtAt) / 1000)}s later`,
      signature: buy.signature,
    })
  }

  const resolved = await waitFor(
    async () => {
      const next = await fetchArena(connections.er)
      return next.current.id > roundId ? next : null
    },
    { timeoutMs: (endTs - now() + 90) * 1000, intervalMs: 1_000, label: 'the crank to roll the round' },
  )
  const rollTs = resolved.lastRollTs
  const settled = await waitFor(
    async () => {
      const player = await fetchPlayer(connections.er, owner.publicKey)
      return player && !positionForRound(player, roundId) ? { player, at: now() } : null
    },
    { timeoutMs: 120_000, intervalMs: 1_000, label: 'the keeper to settle the position' },
  )
  const settlement = await waitFor(
    async () => {
      const list = await getJson(`/api/settlements?roundId=${roundId}&owner=${owner.publicKey.toBase58()}`).catch(() => null)
      return list?.[0] ?? null
    },
    { timeoutMs: 60_000, intervalMs: 2_000, label: 'the settlement in /api/settlements' },
  )
  const tx = await connections.er.getTransaction(settlement.sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  const signer = tx?.transaction.message.getAccountKeys().get(0)?.toBase58()
  const lag = settled.at - rollTs
  record({
    id: 'KPR-01',
    ok: signer === KEEPER && lag <= 30 && !tx?.meta?.err,
    detail: `round ${roundId} rolled at ${rollTs}; position settled ${lag}s later by ${signer === KEEPER ? 'the keeper' : signer}; payout ${settlement.payout} profit ${settlement.profit}; the player never sent settle_player`,
    signature: settlement.sig,
  })

  appendFileSync(new URL('../../../docs/E2E-RUN.md', import.meta.url), [
    '',
    '## Keeper settlement and indexer backfill (Railway)',
    '',
    `Run at ${new Date().toISOString()}. Wallet \`${owner.publicKey.toBase58()}\`, round ${roundId}, buy [${buy.signature.slice(0, 8)}…](${explorerTxUrl(buy.signature, 'er')}).`,
    '',
    '| Item | Result | Detail | Transaction |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.id} | ${row.ok ? 'PASS' : 'FAIL'} | ${row.detail.replaceAll('|', '/')} | ${row.signature ? `[${row.signature.slice(0, 8)}…](${explorerTxUrl(row.signature, 'er')})` : '—'} |`),
    '',
  ].join('\n'))
  const failed = rows.filter((row) => !row.ok).length
  console.log(failed ? `KEEPER/INDEXER FAILED: ${failed}` : 'KEEPER/INDEXER PASSED')
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('KEEPER/INDEXER CRASHED:', error instanceof Error ? error.message : error)
  process.exit(2)
})
