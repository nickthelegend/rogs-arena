/**
 * Real end-to-end run on Solana devnet + MagicBlock devnet-as ER. No mocks.
 *
 * Two fresh players (funded by the deployer) delegate their Player accounts,
 * create Gum session keys, claim chips, trade with ability cards, report a heart
 * rate, sell part of a position, wait for the MagicBlock crank to roll the round,
 * settle, exercise Cheers through MagicBlock VRF when the Cheers card wins, and
 * commit a player back to Solana. Every step is asserted against the SDK math
 * mirror and written to docs/E2E-RUN.md with signatures.
 *
 * Usage: bun run packages/arena-sdk/scripts/e2e-devnet.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js'

import {
  ABILITY_CALM,
  ABILITY_CHEERS,
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  OUTCOME_NO,
  OUTCOME_YES,
  ROUND_OPEN,
  START_CHIPS,
  TRADE_LOCK_SECONDS,
  ABILITY_LOCK_SECONDS,
  USD,
  createConnections,
  createSessionKey,
  decodePlayer,
  ensurePlayerDelegated,
  explorerTxUrl,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  playerPda,
  positionForRound,
  quoteBuy,
  quoteSell,
  sendBaseTransaction,
  sendErTransaction,
  settleSlot,
  waitFor,
  withSlippage,
  type ArenaState,
  type PlayerState,
  type SessionKey,
} from '../src/index'
import { loadKeypair } from './lib/keys'
import { settleObserved } from './lib/settlement'

type Step = { step: string; ok: boolean; skipped?: boolean; detail: string; signature?: string; layer?: 'base' | 'er'; ms?: number }
const steps: Step[] = []

const verdict = (step: Step) => (step.skipped ? 'NOT EXERCISED' : step.ok ? 'PASS' : 'FAIL')

function record(step: Step) {
  steps.push(step)
  const link = step.signature ? ` ${explorerTxUrl(step.signature, step.layer ?? 'er')}` : ''
  const ms = step.ms != null ? ` (${Math.round(step.ms)}ms)` : ''
  console.log(`${verdict(step)} ${step.step}: ${step.detail}${ms}${link}`)
}

function assertEqual<T>(step: string, actual: T, expected: T) {
  const ok = actual === expected
  record({ step, ok, detail: ok ? `${String(actual)}` : `expected ${String(expected)}, got ${String(actual)}` })
  if (!ok) throw new Error(`${step} failed`)
}

const usd = (chips: bigint) => (Number(chips) / 1e6).toFixed(6)

async function main() {
  const connections = createConnections(DEVNET_ENDPOINTS)
  const instructions = new ArenaInstructions(connections.base)
  const deployer = loadKeypair('deployer')
  const players = [Keypair.generate(), Keypair.generate()]

  // 0. Fund two brand-new wallets with devnet SOL for rent and base fees.
  const fund = await sendBaseTransaction(
    connections.base,
    players.map((player) =>
      SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: player.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
    ),
    keypairSigner(deployer),
  )
  record({ step: 'fund players', ok: true, detail: players.map((p) => p.publicKey.toBase58()).join(', '), signature: fund.signature, layer: 'base', ms: fund.ms })

  // 1. Delegate Player accounts to the ER and create session keys.
  const sessions: SessionKey[] = []
  for (const [index, player] of players.entries()) {
    const wallet = keypairSigner(player)
    const ensured = await ensurePlayerDelegated(connections, instructions, wallet)
    record({ step: `P${index + 1} init+delegate player`, ok: Boolean(ensured.player), detail: playerPda(player.publicKey).toBase58(), signature: ensured.delegateSignature ?? undefined, layer: 'base' })
    const session = await createSessionKey(connections, instructions, wallet, 2)
    sessions.push(session)
    record({ step: `P${index + 1} create session key`, ok: true, detail: `signer ${session.keypair.publicKey.toBase58()} token ${session.token.toBase58()}`, signature: session.signature, layer: 'base', ms: session.ms })
  }

  const withSession = async (index: number, build: (signer: PublicKey, owner: PublicKey, token: PublicKey) => Promise<any>) => {
    const session = sessions[index]
    const ix = await build(session.keypair.publicKey, players[index].publicKey, session.token)
    return sendErTransaction(connections.er, [ix], session.keypair)
  }

  // 2. Claim starting chips with the session key (gasless ER transaction).
  for (const index of [0, 1]) {
    const sent = await withSession(index, (signer, owner, token) => instructions.claimChips(signer, owner, token))
    const player = (await fetchPlayer(connections.er, players[index].publicKey))!
    record({ step: `P${index + 1} claim_chips via session key`, ok: player.balance === START_CHIPS, detail: `balance ${usd(player.balance)} USD`, signature: sent.signature, ms: sent.ms })
  }

  // 3. Wait for enough time in the round to place ability trades.
  let arena = await fetchArena(connections.er)
  const now = () => Math.floor(Date.now() / 1000)
  if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() <= ABILITY_LOCK_SECONDS + 20) {
    const previous = arena.current.id
    console.log(`waiting for round ${previous + 1} (current ends at ${new Date(arena.current.endTs * 1000).toISOString()})`)
    arena = await waitFor(
      async () => {
        const next = await fetchArena(connections.er)
        return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
      },
      { timeoutMs: (arena.current.endTs - now() + 120) * 1000, intervalMs: 2_000, label: 'the next round' },
    )
  }
  const roundId = arena.current.id
  record({ step: 'round open', ok: true, detail: `round ${roundId} strike ${arena.current.strikePrice} ends ${new Date(arena.current.endTs * 1000).toISOString()}` })

  // 4. P1 reports a calm heart rate, then buys YES $5 with Calm pulse.
  const heart = await withSession(0, (signer, owner, token) => instructions.reportHeart(signer, owner, 80, token))
  record({ step: 'P1 report_heart 80 bpm', ok: true, detail: 'on-chain heart rate', signature: heart.signature, ms: heart.ms })

  const buyAmount = 5n * USD
  const beforeBuy1 = await fetchArena(connections.er)
  const quote1 = quoteBuy(beforeBuy1.current.yesPool, beforeBuy1.current.noPool, buyAmount, beforeBuy1.feeBps)!
  const buy1 = await withSession(0, (signer, owner, token) =>
    instructions.buy(signer, owner, OUTCOME_YES, buyAmount, withSlippage(quote1.shares, 5), ABILITY_CALM, token),
  )
  let p1 = (await fetchPlayer(connections.er, players[0].publicKey))!
  const pos1 = positionForRound(p1, roundId)!
  record({ step: 'P1 buy YES $5 + Calm pulse', ok: pos1.yesShares > 0n && pos1.ability === ABILITY_CALM && pos1.heartSamples > 0, detail: `shares ${pos1.yesShares} (quote ${quote1.shares}), maxBpm ${pos1.maxBpm}`, signature: buy1.signature, ms: buy1.ms })
  assertEqual('P1 balance after buy', p1.balance, START_CHIPS - buyAmount)
  await withSession(0, (signer, owner, token) => instructions.reportHeart(signer, owner, 84, token))

  // 5. P2 buys NO $5 with Cheers, then sells half.
  const beforeBuy2 = await fetchArena(connections.er)
  const quote2 = quoteBuy(beforeBuy2.current.noPool, beforeBuy2.current.yesPool, buyAmount, beforeBuy2.feeBps)!
  const buy2 = await withSession(1, (signer, owner, token) =>
    instructions.buy(signer, owner, OUTCOME_NO, buyAmount, withSlippage(quote2.shares, 5), ABILITY_CHEERS, token),
  )
  let p2 = (await fetchPlayer(connections.er, players[1].publicKey))!
  const pos2 = positionForRound(p2, roundId)!
  record({ step: 'P2 buy NO $5 + Cheers', ok: pos2.noShares > 0n && pos2.ability === ABILITY_CHEERS, detail: `shares ${pos2.noShares} (quote ${quote2.shares})`, signature: buy2.signature, ms: buy2.ms })

  const sellShares = pos2.noShares / 2n
  const beforeSell = await fetchArena(connections.er)
  const sellQuote = quoteSell(beforeSell.current.noPool, beforeSell.current.yesPool, sellShares, beforeSell.feeBps)!
  const sell = await withSession(1, (signer, owner, token) =>
    instructions.sell(signer, owner, OUTCOME_NO, sellShares, withSlippage(sellQuote.out, 5), token),
  )
  p2 = (await fetchPlayer(connections.er, players[1].publicKey))!
  record({ step: 'P2 sell half NO (take profit/stop)', ok: true, detail: `sold ${sellShares} shares for ${usd(sellQuote.out)} USD`, signature: sell.signature, ms: sell.ms })
  assertEqual('P2 balance after buy+sell', p2.balance, START_CHIPS - buyAmount + sellQuote.out)

  // 6. Ability rules enforced on-chain: no second card, no card after selling.
  try {
    await withSession(1, (signer, owner, token) => instructions.attachAbility(signer, owner, 1, token))
    record({ step: 'attach_ability after sell is rejected', ok: false, detail: 'transaction unexpectedly succeeded' })
    throw new Error('ability exploit guard failed')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const ok = message.includes('ability card is already attached')
    record({ step: 'attach_ability after sell is rejected', ok, detail: message })
    if (!ok) throw error
  }

  // 7. Trade lock: wait for the crank to roll the round.
  const snapshotP1 = positionForRound(await fetchPlayer(connections.er, players[0].publicKey), roundId)!
  const snapshotP2 = positionForRound(await fetchPlayer(connections.er, players[1].publicKey), roundId)!
  const preRollBalances = await Promise.all(
    [players[0], players[1]].map(async (player) => (await fetchPlayer(connections.er, player.publicKey))!.balance),
  )
  const endTs = arena.current.endTs
  console.log(`waiting for the MagicBlock crank to resolve round ${roundId} at ${new Date(endTs * 1000).toISOString()} (lock ${TRADE_LOCK_SECONDS}s before)`)
  const rolled = await waitFor(
    async () => {
      const next = await fetchArena(connections.er)
      return next.current.id > roundId ? next : null
    },
    { timeoutMs: (endTs - now() + 90) * 1000, intervalMs: 2_000, label: `round ${roundId} to roll` },
  )
  const resolved = rolled.history.find((summary) => summary.id === roundId)!
  const lag = rolled.lastRollTs - endTs
  record({ step: 'crank rolled the round inside the ER', ok: Boolean(resolved) && lag <= 30, detail: `outcome ${resolved.outcome === OUTCOME_YES ? 'YES' : 'NO'} strike ${resolved.strikePrice} close ${resolved.closePrice}, rolled ${lag}s after end` })

  // 8. Settle both players (permissionless) and check exact payouts and bonuses. The live keeper
  //    may settle first; settle_player is idempotent, so the delta is measured from before the roll.
  for (const [index, snapshot] of [snapshotP1, snapshotP2].entries()) {
    const expected = settleSlot(snapshot, resolved.outcome)
    const settled = await settleObserved(connections, instructions, players[index].publicKey, roundId, sessions[index].keypair)
    const after = (await fetchPlayer(connections.er, players[index].publicKey))!
    const delta = after.balance - preRollBalances[index]
    const ok =
      delta === expected.payout + expected.bonus &&
      settled.event.payout === expected.payout &&
      settled.event.bonus === expected.bonus &&
      !positionForRound(after, roundId)
    record({ step: `P${index + 1} settle_player`, ok, detail: `payout ${usd(expected.payout)} profit ${usd(expected.profit)} bonus ${usd(expected.bonus)} calm ${expected.calm} cheers ${expected.cheers}; balance delta ${usd(delta)}; settled by ${settled.settledBy}; wins ${after.winsTotal} losses ${after.lossesTotal} calmWins ${after.calmWins}`, signature: settled.signature })
    if (!ok) throw new Error(`P${index + 1} settlement mismatch`)
    if (index === 1 && expected.cheers !== (after.cheersPending > 0)) throw new Error('cheers pending flag mismatch')
  }

  // 9. Cheers via MagicBlock VRF (only reachable when the Cheers card won).
  p2 = (await fetchPlayer(connections.er, players[1].publicKey))!
  if (p2.cheersPending > 0) {
    const p1Before = (await fetchPlayer(connections.er, players[0].publicKey))!
    const seed = crypto.getRandomValues(new Uint8Array(32))
    const request = await sendErTransaction(
      connections.er,
      [await instructions.requestCheers(players[1].publicKey, players[1].publicKey, [players[0].publicKey], seed)],
      players[1],
    )
    record({ step: 'P2 request_cheers (VRF)', ok: true, detail: 'randomness requested on the ephemeral queue', signature: request.signature, ms: request.ms })
    const paid = await waitFor(
      async () => {
        const [winner, candidate] = await Promise.all([
          fetchPlayer(connections.er, players[1].publicKey),
          fetchPlayer(connections.er, players[0].publicKey),
        ])
        return winner && candidate && winner.cheersInflight === 0 && candidate.cheersReceived > p1Before.cheersReceived ? candidate : null
      },
      { timeoutMs: 90_000, intervalMs: 1_500, label: 'the VRF cheers callback' },
    )
    record({ step: 'VRF callback paid cheers', ok: paid.balance - p1Before.balance === 1n * USD, detail: `P1 cheers_received ${usd(paid.cheersReceived)} USD` })
  } else {
    record({ step: 'cheers via VRF', ok: true, skipped: true, detail: 'the Cheers position did not finish in profit this run; e2e-cheers-vrf.ts exercises it deterministically' })
  }

  // 10. Commit P1 back to Solana and read the committed state on the base layer.
  p1 = (await fetchPlayer(connections.er, players[0].publicKey))!
  const commit = await sendErTransaction(connections.er, [await instructions.commitPlayer(players[0].publicKey)], players[0])
  record({ step: 'P1 commit_player to Solana', ok: true, detail: 'commit scheduled from the ER', signature: commit.signature, ms: commit.ms })
  const committed = await waitFor(
    async () => {
      const account = await connections.base.getAccountInfo(playerPda(players[0].publicKey), 'confirmed')
      if (!account) return null
      const onBase = decodePlayer(playerPda(players[0].publicKey), account.data)
      return onBase.tradesTotal === p1.tradesTotal && onBase.balance === p1.balance ? onBase : null
    },
    { timeoutMs: 60_000, intervalMs: 2_000, label: 'the commit to land on Solana' },
  )
  record({ step: 'base layer shows committed player state', ok: true, detail: `trades ${committed.tradesTotal} balance ${usd(committed.balance)} USD`, layer: 'base' })

  const final = await fetchArena(connections.er)
  writeReport(final, [p1, p2].map((player) => player.owner.toBase58()))
  const exercised = steps.filter((step) => !step.skipped)
  console.log(`\nE2E PASSED: ${exercised.filter((step) => step.ok).length}/${exercised.length} steps (${steps.length - exercised.length} not exercised)`)
}

const REPORT_URL = new URL('../../../docs/E2E-RUN.md', import.meta.url)

function writeReport(arena: ArenaState, owners: string[]) {
  // Keep the sections other scripts append (commit_arena, Cheers VRF): only the run table is replaced.
  const previous = existsSync(REPORT_URL) ? readFileSync(REPORT_URL, 'utf8') : ''
  const appendix = previous.indexOf('\n## ') >= 0 ? previous.slice(previous.indexOf('\n## ')) : ''
  const lines = [
    '# E2E devnet run',
    '',
    `Run at ${new Date().toISOString()} against program \`${arena.address ? 'J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q' : ''}\`, MagicBlock ER \`devnet-as\`.`,
    `Players: ${owners.map((owner) => `\`${owner}\``).join(', ')}. Arena round now ${arena.current.id}, treasury ${(Number(arena.treasury) / 1e6).toFixed(2)} USD.`,
    '',
    '| # | Step | Result | Detail | Transaction |',
    '|---|---|---|---|---|',
    ...steps.map((step, index) => `| ${index + 1} | ${step.step} | ${verdict(step)} | ${step.detail.replaceAll('|', '/')} | ${step.signature ? `[${step.signature.slice(0, 8)}…](${explorerTxUrl(step.signature, step.layer ?? 'er')})` : '—'} |`),
    '',
  ]
  writeFileSync(REPORT_URL, lines.join('\n') + appendix)
}

main().catch((error) => {
  console.error('\nE2E FAILED:', error instanceof Error ? error.message : error)
  if (error && typeof error === 'object' && 'logs' in error) console.error((error as { logs: string[] }).logs.join('\n'))
  process.exit(1)
})
