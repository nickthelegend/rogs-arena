/**
 * TEST-PLAN KPR-02 / MG-07: the deployed keeper turns a winning Cheers position into a MagicBlock VRF payout without
 * any player or script sending settle_player or request_cheers. Real devnet + MagicBlock ER + Railway keeper. No mocks.
 * Runs on the quietest market, so the Fair Cheers v2 candidate set is this run's players plus any recent traders there.
 *
 * P2 buys YES with the Cheers card, P1 buys a large YES that moves the AMM, P2 sells into the move at a profit.
 * After the crank resolves the round, the keeper settles both, sees P2's pending Cheers, sends request_cheers,
 * and the VRF callback pays recent traders (P1 among them). Results are appended to docs/E2E-RUN.md.
 *
 * Usage (from packages/arena-sdk): bun scripts/verify-keeper-cheers.ts
 */
import { appendFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'

import {
  ABILITY_CHEERS,
  ABILITY_LOCK_SECONDS,
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  MARKETS,
  OUTCOME_YES,
  PROGRAM_ID,
  ROUND_OPEN,
  USD,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  explorerTxUrl,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  parseArenaEvents,
  playerPda,
  positionForRound,
  quoteBuy,
  quoteSell,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
  withSlippage,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const KEEPER = '59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r'
const API = 'https://arena-production-0bdd.up.railway.app'
const now = () => Math.floor(Date.now() / 1000)
const rows: string[] = []
function record(ok: boolean, step: string, detail: string, signature?: string) {
  const link = signature ? explorerTxUrl(signature, 'er') : ''
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}: ${detail} ${link}`)
  rows.push(`| ${step} | ${ok ? 'PASS' : 'FAIL'} | ${detail.replaceAll('|', '/')} | ${signature ? `[${signature.slice(0, 8)}…](${link})` : '—'} |`)
  if (!ok) throw new Error(`${step} failed: ${detail}`)
}

async function findTx(connections: ReturnType<typeof createConnections>, account: ReturnType<typeof playerPda>, instruction: string, since: number) {
  const signatures = await connections.er.getSignaturesForAddress(account, { limit: 25 }, 'confirmed')
  for (const { signature, blockTime } of signatures) {
    if (blockTime && blockTime < since) continue
    const tx = await connections.er.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    const logs = tx?.meta?.logMessages ?? []
    if (logs.some((line) => line === `Program log: Instruction: ${instruction}`)) {
      return { signature, signer: tx!.transaction.message.getAccountKeys().get(0)!.toBase58(), logs }
    }
  }
  return null
}

async function main() {
  const connections = createConnections(DEVNET_ENDPOINTS)
  const ix = new ArenaInstructions(connections.base)
  const deployer = loadKeypair('deployer')
  const [p1, p2] = [Keypair.generate(), Keypair.generate()]
  const fund = await sendBaseTransaction(
    connections.base,
    [p1, p2].map((player) => SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: player.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })),
    keypairSigner(deployer),
  )
  console.log(`funded ${p1.publicKey.toBase58()} and ${p2.publicKey.toBase58()} (${explorerTxUrl(fund.signature, 'base')})`)

  const arenas = await Promise.all(MARKETS.map((candidate) => fetchArena(connections.er, PROGRAM_ID, candidate.id)))
  const market = MARKETS[arenas.reduce((best, candidate) => (candidate.recent.length < best.recent.length ? candidate : best)).market]
  console.log(`market ${market.symbol} (fewest recent traders)`)

  const sessions = []
  for (const player of [p1, p2]) {
    await ensurePlayerDelegated(connections, ix, keypairSigner(player))
    const session = await createSessionKey(connections, ix, keypairSigner(player), 2)
    sessions.push(session)
    await sendErTransaction(connections.er, [await ix.claimChips(session.keypair.publicKey, player.publicKey, session.token, market.id)], session.keypair)
  }

  let arena = await fetchArena(connections.er, PROGRAM_ID, market.id)
  if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() < ABILITY_LOCK_SECONDS + 60) {
    const previous = arena.current.id
    console.log(`waiting for a fresh round (round ${previous} ends in ${arena.current.endTs - now()}s)`)
    arena = await waitFor(async () => {
      const next = await fetchArena(connections.er, PROGRAM_ID, market.id)
      return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
    }, { timeoutMs: (arena.current.endTs - now() + 120) * 1000, intervalMs: 2_000, label: 'a fresh round' })
  }
  const roundId = arena.current.id

  const stake = 5n * USD
  const q2 = quoteBuy(arena.current.yesPool, arena.current.noPool, stake, arena.feeBps)!
  const buyCheers = await sendErTransaction(connections.er, [await ix.buy(sessions[1].keypair.publicKey, p2.publicKey, OUTCOME_YES, stake, withSlippage(q2.shares, 5), ABILITY_CHEERS, sessions[1].token, market.id)], sessions[1].keypair)
  record(true, 'P2 buys YES $5 with the Cheers card', `${market.symbol} round ${roundId}`, buyCheers.signature)

  arena = await fetchArena(connections.er, PROGRAM_ID, market.id)
  const push = 90n * USD
  const q1 = quoteBuy(arena.current.yesPool, arena.current.noPool, push, arena.feeBps)!
  const buyPush = await sendErTransaction(connections.er, [await ix.buy(sessions[0].keypair.publicKey, p1.publicKey, OUTCOME_YES, push, withSlippage(q1.shares, 5), 0, sessions[0].token, market.id)], sessions[0].keypair)
  record(true, 'P1 buys YES $90 (moves the AMM)', `${q1.shares} shares`, buyPush.signature)

  arena = await fetchArena(connections.er, PROGRAM_ID, market.id)
  const held = positionForRound(await fetchPlayer(connections.er, p2.publicKey), roundId)!.yesShares
  const sq = quoteSell(arena.current.yesPool, arena.current.noPool, held, arena.feeBps)!
  const sell = await sendErTransaction(connections.er, [await ix.sell(sessions[1].keypair.publicKey, p2.publicKey, OUTCOME_YES, held, withSlippage(sq.out, 2), sessions[1].token, market.id)], sessions[1].keypair)
  record(sq.out > stake, 'P2 sells into the move at a profit', `out ${Number(sq.out) / 1e6} USD vs cost 5 USD`, sell.signature)

  const endTs = arena.current.endTs
  const p1Before = (await fetchPlayer(connections.er, p1.publicKey))!
  console.log(`waiting ${endTs - now()}s for round ${roundId} to end; no settle_player or request_cheers is sent from here`)
  await waitFor(async () => ((await fetchArena(connections.er, PROGRAM_ID, market.id)).current.id > roundId ? true : null), { timeoutMs: (endTs - now() + 90) * 1000, intervalMs: 2_000, label: 'the crank roll' })

  const paid = await waitFor(async () => {
    const [winner, recipient] = await Promise.all([fetchPlayer(connections.er, p2.publicKey), fetchPlayer(connections.er, p1.publicKey)])
    return winner && recipient && winner.cheersPending === 0 && winner.cheersInflight === 0 && recipient.cheersReceived > p1Before.cheersReceived ? { winner, recipient } : null
  }, { timeoutMs: 240_000, intervalMs: 2_000, label: 'the keeper-driven VRF payout' })
  record(paid.recipient.balance - p1Before.balance >= 1n * USD, 'P1 received Cheers after resolution', `cheers_received ${Number(paid.recipient.cheersReceived) / 1e6} USD`)

  const since = endTs - 5
  const settle = await findTx(connections, playerPda(p2.publicKey), 'SettlePlayer', since)
  record(Boolean(settle) && settle!.signer === KEEPER, 'P2 settled by the keeper', `signer ${settle?.signer ?? 'none'}`, settle?.signature)
  const request = await findTx(connections, playerPda(p2.publicKey), 'RequestCheers', since)
  record(Boolean(request) && request!.signer === KEEPER, 'request_cheers sent by the keeper', `signer ${request?.signer ?? 'none'}`, request?.signature)
  const callback = await findTx(connections, playerPda(p1.publicKey), 'CheersCallback', since)
  const event = callback ? parseArenaEvents(callback.logs).find((item) => item.name === 'CheersPaid') : undefined
  record(
    event?.name === 'CheersPaid' && event.data.owner.equals(p2.publicKey) && event.data.recipients.some((key) => key.equals(p1.publicKey)),
    'VRF callback paid recent traders',
    event?.name === 'CheersPaid' ? `recipients ${event.data.recipients.length} (incl. P1), ${Number(event.data.amountEach) / 1e6} USD each, randomness ${Buffer.from(event.data.randomness).toString('hex').slice(0, 16)}…` : 'no CheersPaid event',
    callback?.signature,
  )
  const indexed = await (await fetch(`${API}/api/cheers?limit=5`)).json() as { sig: string }[]
  record(Boolean(callback && indexed.some((row) => row.sig === callback.signature)), 'indexer stored the CheersPaid row', `/api/cheers has ${callback?.signature.slice(0, 10)}…`)

  appendFileSync(new URL('../../../docs/E2E-RUN.md', import.meta.url), ['', `## Keeper-driven Cheers via MagicBlock VRF (KPR-02 / MG-07, ${market.symbol}, Fair Cheers v2)`, '', `Run at ${new Date().toISOString()}, round ${roundId}. P1 \`${p1.publicKey.toBase58()}\`, P2 \`${p2.publicKey.toBase58()}\`.`, '', '| Step | Result | Detail | Transaction |', '|---|---|---|---|', ...rows, ''].join('\n'))
  console.log('KEEPER CHEERS PASSED')
  process.exit(0)
}

main().catch((error) => {
  console.error('KEEPER CHEERS FAILED:', error instanceof Error ? error.message : error)
  if (error && typeof error === 'object' && 'logs' in error) console.error((error as { logs: string[] }).logs.join('\n'))
  process.exit(1)
})
