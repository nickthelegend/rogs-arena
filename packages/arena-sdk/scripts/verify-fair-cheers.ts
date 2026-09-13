/**
 * MG-01 on devnet: Fair Cheers v2 (upgrade #2).
 * Three fresh players trade in one round of the quietest market. P2 buys YES with the Cheers card and
 * sells into P1's push, so P2 settles in profit whatever the price does; P3 trades too.
 * The moment the round rolls, settle_player(P2) and request_cheers go out in one ER transaction, so
 * the keeper can't request Cheers for P2 first:
 *   - a curated candidate list (P1 only, while P3 is also a recent trader) is rejected
 *   - the complete list (every recent trader except P2) is accepted and the VRF callback pays
 * Usage: bun run packages/arena-sdk/scripts/verify-fair-cheers.ts
 */
import { appendFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, type PublicKey, type TransactionInstruction } from '@solana/web3.js'
import {
  ABILITY_CHEERS,
  ABILITY_LOCK_SECONDS,
  ArenaInstructions,
  CHEERS_AMOUNT,
  CHEERS_RECIPIENTS,
  DEVNET_ENDPOINTS,
  MARKETS,
  OUTCOME_NO,
  OUTCOME_YES,
  PROGRAM_ID,
  ROUND_OPEN,
  USD,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  fairCheersCandidates,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  positionForRound,
  quoteBuy,
  quoteSell,
  roundNumber,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
  withSlippage,
  type ArenaState,
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
  rows.push(`| ${id} | ${check} | ${ok ? 'PASS' : 'FAIL'} | ${detail.replaceAll('|', '/')} |`)
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const deployer = loadKeypair('deployer')
const players = [Keypair.generate(), Keypair.generate(), Keypair.generate()]
const [p1, p2, p3] = players
await sendBaseTransaction(
  c.base,
  players.map((player) => SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: player.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })),
  keypairSigner(deployer),
)

// The quietest market keeps the candidate list small and the draw easy to audit.
const arenas = await Promise.all(MARKETS.map((market) => fetchArena(c.er, PROGRAM_ID, market.id)))
const quietest = arenas.reduce((best, arena) => (arena.recent.length < best.recent.length ? arena : best))
const market = MARKETS[quietest.market]
console.log(`market ${market.symbol}: ${quietest.recent.length} recent traders before this run`)

const sessions: Awaited<ReturnType<typeof createSessionKey>>[] = []
for (const player of players) {
  await ensurePlayerDelegated(c, ix, keypairSigner(player))
  const session = await createSessionKey(c, ix, keypairSigner(player), 2)
  sessions.push(session)
  await sendErTransaction(c.er, [await ix.claimChips(session.keypair.publicKey, player.publicKey, session.token, market.id)], session.keypair)
}
const send = (index: number, build: (signer: PublicKey, owner: PublicKey, token: PublicKey) => Promise<TransactionInstruction>) =>
  build(sessions[index].keypair.publicKey, players[index].publicKey, sessions[index].token).then((instruction) =>
    sendErTransaction(c.er, [instruction], sessions[index].keypair),
  )

let arena: ArenaState = await fetchArena(c.er, PROGRAM_ID, market.id)
if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() < ABILITY_LOCK_SECONDS + 45) {
  const previous = arena.current.id
  arena = await waitFor(
    async () => {
      const next = await fetchArena(c.er, PROGRAM_ID, market.id)
      return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
    },
    { timeoutMs: (arena.current.endTs - now() + 120) * 1000, intervalMs: 2_000, label: 'a fresh round' },
  )
}
const roundId = arena.current.id
const stake = 5n * USD

const q2 = quoteBuy(arena.current.yesPool, arena.current.noPool, stake, arena.feeBps)!
await send(1, (signer, owner, token) => ix.buy(signer, owner, OUTCOME_YES, stake, withSlippage(q2.shares, 5), ABILITY_CHEERS, token, market.id))
arena = await fetchArena(c.er, PROGRAM_ID, market.id)
const q1 = quoteBuy(arena.current.yesPool, arena.current.noPool, 90n * USD, arena.feeBps)!
await send(0, (signer, owner, token) => ix.buy(signer, owner, OUTCOME_YES, 90n * USD, withSlippage(q1.shares, 5), 0, token, market.id))
arena = await fetchArena(c.er, PROGRAM_ID, market.id)
const q3 = quoteBuy(arena.current.noPool, arena.current.yesPool, stake, arena.feeBps)!
await send(2, (signer, owner, token) => ix.buy(signer, owner, OUTCOME_NO, stake, withSlippage(q3.shares, 5), 0, token, market.id))
arena = await fetchArena(c.er, PROGRAM_ID, market.id)
const held = positionForRound(await fetchPlayer(c.er, p2.publicKey), roundId)!.yesShares
const sq = quoteSell(arena.current.yesPool, arena.current.noPool, held, arena.feeBps)!
if (sq.out <= stake) throw new Error(`P2 sell quote ${sq.out} is not above its cost`)
await send(1, (signer, owner, token) => ix.sell(signer, owner, OUTCOME_YES, held, withSlippage(sq.out, 2), token, market.id))
console.log(`${market.symbol} round #${roundNumber(roundId)}: P2 locked +${Number(sq.out - stake) / 1e6} USD with the Cheers card; P1 and P3 traded`)

const endTs = arena.current.endTs
await waitFor(async () => ((await fetchArena(c.er, PROGRAM_ID, market.id)).current.id > roundId ? true : null), {
  timeoutMs: (endTs - now() + 90) * 1000,
  intervalMs: 300,
  label: 'round roll',
})
const rolled = await fetchArena(c.er, PROGRAM_ID, market.id)
const full = fairCheersCandidates(rolled, p2.publicKey)
const settleP2 = await ix.settlePlayer(p2.publicKey, market.id)
const seed = () => crypto.getRandomValues(new Uint8Array(32))

try {
  await sendErTransaction(c.er, [settleP2, await ix.requestCheers(p2.publicKey, p2.publicKey, [p1.publicKey], seed(), market.id)], p2)
  record('MG-01', 'a curated candidate list is rejected', false, 'transaction unexpectedly succeeded')
} catch (error) {
  const text = message(error)
  record('MG-01', 'a curated candidate list is rejected', /Every recent trader except the winner/.test(text), `P1 only, of ${full.length} recent traders; rejected: "${text.slice(0, 120)}"`)
}

const before = await Promise.all(full.map((owner) => fetchPlayer(c.er, owner)))
try {
  const request = await sendErTransaction(c.er, [settleP2, await ix.requestCheers(p2.publicKey, p2.publicKey, full, seed(), market.id)], p2)
  const after = await waitFor(
    async () => {
      const winner = await fetchPlayer(c.er, p2.publicKey)
      if (!winner || winner.cheersInflight !== 0) return null
      const current = await Promise.all(full.map((owner) => fetchPlayer(c.er, owner)))
      return current.some((player, index) => player && before[index] && player.cheersReceived > before[index]!.cheersReceived) ? current : null
    },
    { timeoutMs: 120_000, intervalMs: 1_500, label: 'the VRF callback' },
  )
  const gains = after.map((player, index) => (player && before[index] ? player.cheersReceived - before[index]!.cheersReceived : 0n))
  const paid = gains.filter((gain) => gain === CHEERS_AMOUNT).length
  const expected = Math.min(full.length, CHEERS_RECIPIENTS)
  record(
    'MG-01',
    'the complete candidate list is accepted and the VRF callback pays',
    paid === expected && gains.every((gain) => gain === 0n || gain === CHEERS_AMOUNT),
    `request ${request.signature}; ${full.length} candidates, ${paid} paid ${Number(CHEERS_AMOUNT) / 1e6} USD each (expected ${expected})`,
  )
} catch (error) {
  record('MG-01', 'the complete candidate list is accepted and the VRF callback pays', false, message(error))
}

appendFileSync(
  new URL('../../../docs/TEST-RUN-CHAIN.md', import.meta.url),
  ['', '## Fair Cheers v2 (upgrade #2)', '', `Run at ${new Date().toISOString()}, ${market.symbol} round ${roundId}.`, '', '| Plan ID | Check | Result | Observed |', '|---|---|---|---|', ...rows, ''].join('\n'),
)
console.log(failures ? `FAIR CHEERS FAILED: ${failures}` : 'FAIR CHEERS PASSED')
process.exit(failures ? 1 : 0)
