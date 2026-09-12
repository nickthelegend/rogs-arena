/**
 * Deterministic Cheers + MagicBlock VRF run on devnet.
 * P2 buys YES with the Cheers card, P1 buys a large YES that moves the AMM
 * price, P2 sells into it at a profit, so P2's position settles in profit
 * whatever BTC does. P2 then requests VRF randomness on the ER and the
 * callback pays P1 (the only other recent trader in the candidate list).
 * Usage: bun run packages/arena-sdk/scripts/e2e-cheers-vrf.ts
 */
import { appendFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'

import {
  ABILITY_CHEERS,
  ABILITY_LOCK_SECONDS,
  ArenaInstructions,
  CHEERS_AMOUNT,
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
  parseArenaEvents,
  positionForRound,
  quoteBuy,
  quoteSell,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
  withSlippage,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const lines: string[] = []
const log = (ok: boolean, step: string, detail: string, signature?: string, layer: 'base' | 'er' = 'er') => {
  const link = signature ? explorerTxUrl(signature, layer) : ''
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}: ${detail} ${link}`)
  lines.push(`| ${step} | ${ok ? 'PASS' : 'FAIL'} | ${detail.replaceAll('|', '/')} | ${signature ? `[${signature.slice(0, 8)}…](${link})` : '—'} |`)
  if (!ok) throw new Error(`${step} failed: ${detail}`)
}
const now = () => Math.floor(Date.now() / 1000)

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
  log(true, 'fund players', `${p1.publicKey.toBase58()}, ${p2.publicKey.toBase58()}`, fund.signature, 'base')

  const sessions = []
  for (const player of [p1, p2]) {
    await ensurePlayerDelegated(connections, ix, keypairSigner(player))
    const session = await createSessionKey(connections, ix, keypairSigner(player), 2)
    sessions.push(session)
    await sendErTransaction(connections.er, [await ix.claimChips(session.keypair.publicKey, player.publicKey, session.token)], session.keypair)
  }
  log(true, 'players delegated, sessions created, chips claimed', 'both players at 250 USD')

  let arena = await fetchArena(connections.er)
  if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() < ABILITY_LOCK_SECONDS + 40) {
    const previous = arena.current.id
    arena = await waitFor(async () => {
      const next = await fetchArena(connections.er)
      return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
    }, { timeoutMs: (arena.current.endTs - now() + 120) * 1000, intervalMs: 2_000, label: 'a fresh round' })
  }
  const roundId = arena.current.id

  const stake = 5n * USD
  const q2 = quoteBuy(arena.current.yesPool, arena.current.noPool, stake, arena.feeBps)!
  const buyCheers = await sendErTransaction(connections.er, [await ix.buy(sessions[1].keypair.publicKey, p2.publicKey, OUTCOME_YES, stake, withSlippage(q2.shares, 5), ABILITY_CHEERS, sessions[1].token)], sessions[1].keypair)
  log(true, 'P2 buy YES $5 with Cheers', `${q2.shares} shares in round ${roundId}`, buyCheers.signature)

  arena = await fetchArena(connections.er)
  const push = 90n * USD
  const q1 = quoteBuy(arena.current.yesPool, arena.current.noPool, push, arena.feeBps)!
  const buyPush = await sendErTransaction(connections.er, [await ix.buy(sessions[0].keypair.publicKey, p1.publicKey, OUTCOME_YES, push, withSlippage(q1.shares, 5), 0, sessions[0].token)], sessions[0].keypair)
  log(true, 'P1 buy YES $90 (moves the AMM price)', `${q1.shares} shares`, buyPush.signature)

  arena = await fetchArena(connections.er)
  const held = positionForRound(await fetchPlayer(connections.er, p2.publicKey), roundId)!.yesShares
  const sq = quoteSell(arena.current.yesPool, arena.current.noPool, held, arena.feeBps)!
  log(sq.out > stake, 'sell quote is above cost', `sell ${held} YES for ${Number(sq.out) / 1e6} USD vs cost 5 USD`)
  const sell = await sendErTransaction(connections.er, [await ix.sell(sessions[1].keypair.publicKey, p2.publicKey, OUTCOME_YES, held, withSlippage(sq.out, 2), sessions[1].token)], sessions[1].keypair)
  log(true, 'P2 sells into the move', `realized ${Number(sq.out - stake) / 1e6} USD`, sell.signature)

  const endTs = arena.current.endTs
  const rolled = await waitFor(async () => {
    const next = await fetchArena(connections.er)
    return next.current.id > roundId ? next : null
  }, { timeoutMs: (endTs - now() + 90) * 1000, intervalMs: 2_000, label: `round ${roundId} roll` })
  log(true, 'crank rolled the round', `round ${roundId} outcome ${rolled.history.find((r) => r.id === roundId)?.outcome === 1 ? 'YES' : 'NO'}, ${rolled.lastRollTs - endTs}s after end`)

  const settle = await sendErTransaction(connections.er, [await ix.settlePlayer(p2.publicKey)], sessions[1].keypair)
  const settleTx = await connections.er.getTransaction(settle.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  const settled = parseArenaEvents(settleTx?.meta?.logMessages ?? []).find((event) => event.name === 'PositionSettled')
  const p2After = (await fetchPlayer(connections.er, p2.publicKey))!
  log(settled?.name === 'PositionSettled' && settled.data.cheers && p2After.cheersPending === 1, 'P2 settle marks Cheers pending', `profit ${settled?.name === 'PositionSettled' ? Number(settled.data.profit) / 1e6 : '?'} USD, cheers_pending ${p2After.cheersPending}`, settle.signature)
  await sendErTransaction(connections.er, [await ix.settlePlayer(p1.publicKey)], sessions[0].keypair)

  const before = (await fetchPlayer(connections.er, p1.publicKey))!
  const seed = crypto.getRandomValues(new Uint8Array(32))
  const request = await sendErTransaction(connections.er, [await ix.requestCheers(p2.publicKey, p2.publicKey, [p1.publicKey], seed)], p2)
  log(true, 'P2 request_cheers on the ephemeral VRF queue', 'candidate: P1', request.signature)

  const paid = await waitFor(async () => {
    const [winner, candidate] = await Promise.all([fetchPlayer(connections.er, p2.publicKey), fetchPlayer(connections.er, p1.publicKey)])
    return winner?.cheersInflight === 0 && candidate && candidate.cheersReceived > before.cheersReceived ? candidate : null
  }, { timeoutMs: 120_000, intervalMs: 1_500, label: 'the VRF callback' })
  log(paid.balance - before.balance === CHEERS_AMOUNT, 'VRF callback paid Cheers', `P1 balance +${Number(paid.balance - before.balance) / 1e6} USD, cheers_received ${Number(paid.cheersReceived) / 1e6} USD`)

  const signatures = await connections.er.getSignaturesForAddress(p1.publicKey === p1.publicKey ? (await import('../src/index')).playerPda(p1.publicKey) : p1.publicKey, { limit: 10 })
  for (const { signature } of signatures) {
    const tx = await connections.er.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    const event = parseArenaEvents(tx?.meta?.logMessages ?? []).find((item) => item.name === 'CheersPaid')
    if (event?.name === 'CheersPaid') {
      log(true, 'CheersPaid event from the VRF callback transaction', `recipients ${event.data.recipients.map((key) => key.toBase58()).join(', ')}, randomness ${Buffer.from(event.data.randomness).toString('hex').slice(0, 16)}…`, signature)
      break
    }
  }

  appendFileSync(new URL('../../../docs/E2E-RUN.md', import.meta.url), ['', '## Cheers via MagicBlock VRF (deterministic run)', '', `Run at ${new Date().toISOString()}.`, '', '| Step | Result | Detail | Transaction |', '|---|---|---|---|', ...lines, ''].join('\n'))
  console.log('CHEERS VRF E2E PASSED')
}

main().catch((error) => {
  console.error('CHEERS VRF E2E FAILED:', error instanceof Error ? error.message : error)
  if (error && typeof error === 'object' && 'logs' in error) console.error((error as { logs: string[] }).logs.join('\n'))
  process.exit(1)
})
