/**
 * Negative-path verification of every on-chain guard, with real devnet + ER
 * transactions (TEST-PLAN CH-07, 09, 11, 12, 13, 15, 16, 17, 21, 23).
 * Usage: bun run packages/arena-sdk/scripts/test-guards.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'
import {
  ABILITY_DOUBLE,
  ABILITY_PROTECT,
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  OUTCOME_NO,
  OUTCOME_YES,
  ROUND_OPEN,
  USD,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  positionForRound,
  quoteBuy,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const rows: string[] = []
let failures = 0
const now = () => Math.floor(Date.now() / 1000)
const c = createConnections(DEVNET_ENDPOINTS)
const ix = new ArenaInstructions(c.base)

function record(id: string, check: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}: ${detail}`)
  rows.push(`| ${id} | ${check} | ${ok ? 'PASS' : 'FAIL'} | ${detail.replaceAll('|', '/').replaceAll('\n', ' ')} |`)
}

async function expectFail(id: string, check: string, run: () => Promise<unknown>, includes: string[], unchanged?: () => Promise<boolean>) {
  try {
    const result = await run()
    record(id, check, false, `unexpectedly succeeded ${JSON.stringify(result)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const matched = includes.some((needle) => message.toLowerCase().includes(needle.toLowerCase()))
    const same = unchanged ? await unchanged() : true
    record(id, check, matched && same, `rejected: "${message}"${unchanged ? `; state unchanged: ${same}` : ''}`)
  }
}

async function main() {
  const deployer = loadKeypair('deployer')
  const [a, b, stranger] = [Keypair.generate(), Keypair.generate(), Keypair.generate()]
  await sendBaseTransaction(c.base, [a, b].map((p) => SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: p.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })), keypairSigner(deployer))
  const sessions = []
  for (const p of [a, b]) {
    await ensurePlayerDelegated(c, ix, keypairSigner(p))
    const s = await createSessionKey(c, ix, keypairSigner(p), 2)
    sessions.push(s)
    await sendErTransaction(c.er, [await ix.claimChips(s.keypair.publicKey, p.publicKey, s.token)], s.keypair)
  }
  const [sa, sb] = sessions
  const balance = async (owner: Keypair) => (await fetchPlayer(c.er, owner.publicKey))!.balance
  const aStart = await balance(a)
  const bStart = await balance(b)

  let arena = await fetchArena(c.er)
  if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() < 75) {
    const previous = arena.current.id
    arena = await waitFor(async () => {
      const next = await fetchArena(c.er)
      return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
    }, { timeoutMs: (arena.current.endTs - now() + 120) * 1000, intervalMs: 2_000, label: 'fresh round' })
  }
  const roundId = arena.current.id
  const endTs = arena.current.endTs

  await expectFail('CH-09', 'second claim_chips is rejected', async () => sendErTransaction(c.er, [await ix.claimChips(sa.keypair.publicKey, a.publicKey, sa.token)], sa.keypair), ['cooling down'], async () => (await balance(a)) === aStart)
  await expectFail('CH-07', "session key of A cannot trade for B", async () => sendErTransaction(c.er, [await ix.buy(sa.keypair.publicKey, b.publicKey, OUTCOME_YES, 2n * USD, 0n, 0, sa.token)], sa.keypair), ['token', 'not allowed', 'constraint', 'seeds', 'session'], async () => (await balance(b)) === bStart)
  await expectFail('CH-07', 'stranger without a session token cannot trade for A', async () => sendErTransaction(c.er, [await ix.buy(stranger.publicKey, a.publicKey, OUTCOME_YES, 2n * USD, 0n, 0, null)], stranger), ['not allowed'], async () => (await balance(a)) === aStart)
  await expectFail('CH-11', 'buy 0.5 USD is below the minimum', async () => sendErTransaction(c.er, [await ix.buy(sa.keypair.publicKey, a.publicKey, OUTCOME_YES, 500_000n, 0n, 0, sa.token)], sa.keypair), ['below the minimum'])
  await expectFail('CH-11', 'buy 101 USD is above the maximum', async () => sendErTransaction(c.er, [await ix.buy(sa.keypair.publicKey, a.publicKey, OUTCOME_YES, 101n * USD, 0n, 0, sa.token)], sa.keypair), ['above the maximum'])
  for (let i = 0; i < 2; i++) await sendErTransaction(c.er, [await ix.buy(sb.keypair.publicKey, b.publicKey, OUTCOME_NO, 100n * USD, 0n, 0, sb.token)], sb.keypair)
  await expectFail('CH-11', 'buy with more than the balance is rejected', async () => sendErTransaction(c.er, [await ix.buy(sb.keypair.publicKey, b.publicKey, OUTCOME_NO, 100n * USD, 0n, 0, sb.token)], sb.keypair), ['not enough chips'], async () => (await balance(b)) === bStart - 200n * USD)

  arena = await fetchArena(c.er)
  const quote = quoteBuy(arena.current.yesPool, arena.current.noPool, 2n * USD, arena.feeBps)!
  await expectFail('CH-12', 'min_shares one above the quote fails slippage', async () => sendErTransaction(c.er, [await ix.buy(sa.keypair.publicKey, a.publicKey, OUTCOME_YES, 2n * USD, quote.shares + 1n, 0, sa.token)], sa.keypair), ['slippage'], async () => (await balance(a)) === aStart)

  await sendErTransaction(c.er, [await ix.buy(sa.keypair.publicKey, a.publicKey, OUTCOME_YES, 2n * USD, 0n, 0, sa.token)], sa.keypair)
  const held = positionForRound(await fetchPlayer(c.er, a.publicKey), roundId)!.yesShares
  await expectFail('CH-15', 'selling more shares than held fails', async () => sendErTransaction(c.er, [await ix.sell(sa.keypair.publicKey, a.publicKey, OUTCOME_YES, held + 1n, 0n, sa.token)], sa.keypair), ['not enough shares'])

  const attach = await sendErTransaction(c.er, [await ix.attachAbility(sa.keypair.publicKey, a.publicKey, ABILITY_DOUBLE, sa.token)], sa.keypair)
  const abilityNow = positionForRound(await fetchPlayer(c.er, a.publicKey), roundId)!.ability
  record('CH-16', 'attach_ability on an open position succeeds', abilityNow === ABILITY_DOUBLE, `ability ${abilityNow} tx ${attach.signature}`)
  await expectFail('CH-16', 'second ability card is rejected', async () => sendErTransaction(c.er, [await ix.attachAbility(sa.keypair.publicKey, a.publicKey, ABILITY_PROTECT, sa.token)], sa.keypair), ['already attached'])

  const heart = await sendErTransaction(c.er, [await ix.reportHeart(sa.keypair.publicKey, a.publicKey, 80, sa.token)], sa.keypair)
  const playerA = (await fetchPlayer(c.er, a.publicKey))!
  const pos = positionForRound(playerA, roundId)!
  record('CH-17', 'report_heart 80 updates player and live position', playerA.heartBpm === 80 && pos.maxBpm === 80 && pos.heartSamples >= 1, `heart ${playerA.heartBpm} maxBpm ${pos.maxBpm} samples ${pos.heartSamples} tx ${heart.signature}`)
  await expectFail('CH-17', 'report_heart 20 is out of range', async () => sendErTransaction(c.er, [await ix.reportHeart(sa.keypair.publicKey, a.publicKey, 20, sa.token)], sa.keypair), ['out of range'])

  const before = await balance(a)
  await sendErTransaction(c.er, [await ix.settlePlayer(a.publicKey)], stranger)
  await sendErTransaction(c.er, [await ix.settlePlayer(a.publicKey)], stranger)
  record('CH-21', 'settle_player with nothing resolved is an idempotent no-op', (await balance(a)) === before, `balance unchanged at ${Number(before) / 1e6}`)

  await expectFail('CH-23', 'fund_treasury by a non-authority is rejected', async () => sendErTransaction(c.er, [await ix.fundTreasury(stranger.publicKey, 1n)], stranger), ['not allowed'])
  await expectFail('CH-23', 'commit_arena by a non-authority is rejected', async () => sendErTransaction(c.er, [await ix.commitArena(stranger.publicKey)], stranger), ['not allowed'])

  // Locks: attach within 30s of the end, then buy within the last 5s.
  await sendErTransaction(c.er, [await ix.buy(sb.keypair.publicKey, b.publicKey, OUTCOME_NO, 10n * USD, 0n, 0, sb.token)], sb.keypair).catch(() => null)
  const waitUntil = async (ts: number) => { while (now() < ts) await Bun.sleep(250) }
  await waitUntil(endTs - 20)
  await expectFail('CH-16', 'ability cannot be attached in the last 30 seconds', async () => sendErTransaction(c.er, [await ix.attachAbility(sb.keypair.publicKey, b.publicKey, ABILITY_PROTECT, sb.token)], sb.keypair), ['locked'])
  await waitUntil(endTs - 3)
  await expectFail('CH-13', 'buy in the last 5 seconds is locked', async () => sendErTransaction(c.er, [await ix.buy(sa.keypair.publicKey, a.publicKey, OUTCOME_YES, 2n * USD, 0n, 0, sa.token)], sa.keypair), ['locked'])

  // Keep the sections other scripts append (ability bonuses): only the guard table is replaced.
  const reportUrl = new URL('../../../docs/TEST-RUN-CHAIN.md', import.meta.url)
  const previous = existsSync(reportUrl) ? readFileSync(reportUrl, 'utf8') : ''
  const appendix = previous.indexOf('\n## ') >= 0 ? previous.slice(previous.indexOf('\n## ')) : ''
  writeFileSync(reportUrl, [
    '# On-chain guard verification (devnet + MagicBlock ER)',
    '',
    `Run at ${new Date().toISOString()} in round ${roundId}. Players ${a.publicKey.toBase58()}, ${b.publicKey.toBase58()}; stranger ${stranger.publicKey.toBase58()}.`,
    '',
    '| Plan ID | Check | Result | Observed |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n'))
  console.log(failures ? `GUARDS FAILED: ${failures}` : 'ALL GUARDS PASSED')
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error('GUARD RUN CRASHED:', error instanceof Error ? error.message : error)
  process.exit(2)
})
