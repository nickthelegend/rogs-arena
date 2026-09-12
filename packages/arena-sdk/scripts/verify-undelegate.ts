/**
 * Verifies the full Player lifecycle on devnet + MagicBlock devnet-as. No mocks.
 *
 * A fresh wallet delegates its Player, claims chips on the ER, then runs
 * undelegate_player (commit_and_undelegate). The script checks that the account
 * returns to the program on Solana with the ER balance, that the Magic Router
 * reports it as not delegated, and that it can be delegated again with the
 * balance intact. Results and signatures are appended to docs/E2E-RUN.md.
 *
 * Usage (from packages/arena-sdk): bun scripts/verify-undelegate.ts
 */
import { appendFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'

import {
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  PROGRAM_ID,
  START_CHIPS,
  createConnections,
  createSessionKey,
  decodePlayer,
  ensurePlayerDelegated,
  explorerTxUrl,
  fetchPlayer,
  getDelegationStatus,
  keypairSigner,
  playerPda,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
  waitForDelegation,
  waitForUndelegation,
} from '../src/index'
import { loadKeypair } from './lib/keys'

type Row = { step: string; ok: boolean; detail: string; signature?: string; layer?: 'base' | 'er' }
const rows: Row[] = []

function record(row: Row) {
  rows.push(row)
  const link = row.signature ? ` ${explorerTxUrl(row.signature, row.layer ?? 'er')}` : ''
  console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.step}: ${row.detail}${link}`)
  if (!row.ok) throw new Error(`${row.step} failed: ${row.detail}`)
}

const usd = (chips: bigint) => (Number(chips) / 1e6).toFixed(6)

async function main() {
  const connections = createConnections(DEVNET_ENDPOINTS)
  const instructions = new ArenaInstructions(connections.base)
  const deployer = loadKeypair('deployer')
  const owner = Keypair.generate()
  const wallet = keypairSigner(owner)
  const player = playerPda(owner.publicKey)

  const fund = await sendBaseTransaction(
    connections.base,
    [SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })],
    keypairSigner(deployer),
  )
  record({ step: 'fund wallet', ok: true, detail: owner.publicKey.toBase58(), signature: fund.signature, layer: 'base' })

  const first = await ensurePlayerDelegated(connections, instructions, wallet)
  await waitForDelegation(connections, player)
  record({ step: 'init + delegate Player', ok: Boolean(first.player), detail: player.toBase58(), signature: first.delegateSignature ?? undefined, layer: 'base' })

  const session = await createSessionKey(connections, instructions, wallet, 1)
  const claim = await sendErTransaction(
    connections.er,
    [await instructions.claimChips(session.keypair.publicKey, owner.publicKey, session.token)],
    session.keypair,
  )
  const onEr = (await fetchPlayer(connections.er, owner.publicKey))!
  record({ step: 'claim_chips on the ER', ok: onEr.balance === START_CHIPS, detail: `ER balance ${usd(onEr.balance)} USD`, signature: claim.signature })

  const routerBefore = await getDelegationStatus(DEVNET_ENDPOINTS.routerUrl, player)
  record({ step: 'router reports delegated', ok: routerBefore.isDelegated === true, detail: JSON.stringify(routerBefore) })

  const undelegate = await sendErTransaction(connections.er, [await instructions.undelegatePlayer(owner.publicKey)], owner)
  record({ step: 'undelegate_player (commit_and_undelegate)', ok: true, detail: 'scheduled from the ER', signature: undelegate.signature })

  await waitForUndelegation(connections, player, 90_000)
  const baseAccount = await connections.base.getAccountInfo(player, 'confirmed')
  const onBase = decodePlayer(player, baseAccount!.data)
  record({
    step: 'Player back under the program on Solana with ER state',
    ok: baseAccount!.owner.equals(PROGRAM_ID) && onBase.balance === onEr.balance && onBase.joined === onEr.joined && onBase.lastFaucetTs === onEr.lastFaucetTs,
    detail: `owner ${baseAccount!.owner.toBase58()}, base balance ${usd(onBase.balance)} USD`,
    layer: 'base',
  })

  const routerAfter = await waitFor(
    async () => {
      const status = await getDelegationStatus(DEVNET_ENDPOINTS.routerUrl, player)
      return status.isDelegated === false ? status : null
    },
    { timeoutMs: 60_000, intervalMs: 2_000, label: 'the router to report the Player undelegated' },
  )
  record({ step: 'router reports undelegated', ok: routerAfter.isDelegated === false, detail: JSON.stringify(routerAfter) })

  const second = await ensurePlayerDelegated(connections, instructions, wallet)
  await waitForDelegation(connections, player)
  const back = await waitFor(async () => fetchPlayer(connections.er, owner.publicKey), { timeoutMs: 45_000, intervalMs: 1_000, label: 'the re-delegated Player on the ER' })
  record({
    step: 're-delegate Player, balance intact on the ER',
    ok: back.balance === onEr.balance && second.delegateSignature != null,
    detail: `ER balance ${usd(back.balance)} USD`,
    signature: second.delegateSignature ?? undefined,
    layer: 'base',
  })

  appendFileSync(new URL('../../../docs/E2E-RUN.md', import.meta.url), [
    '',
    '## Player undelegate and re-delegate (commit_and_undelegate)',
    '',
    `Run at ${new Date().toISOString()}. Wallet \`${owner.publicKey.toBase58()}\`, Player \`${player.toBase58()}\`.`,
    '',
    '| Step | Result | Detail | Transaction |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.step} | ${row.ok ? 'PASS' : 'FAIL'} | ${row.detail.replaceAll('|', '/')} | ${row.signature ? `[${row.signature.slice(0, 8)}…](${explorerTxUrl(row.signature, row.layer ?? 'er')})` : '—'} |`),
    '',
  ].join('\n'))
  console.log('UNDELEGATE LIFECYCLE PASSED')
  process.exit(0)
}

main().catch((error) => {
  console.error('UNDELEGATE LIFECYCLE FAILED:', error instanceof Error ? error.message : error)
  if (error && typeof error === 'object' && 'logs' in error) console.error((error as { logs: string[] }).logs.join('\n'))
  process.exit(1)
})
