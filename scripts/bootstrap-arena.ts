/**
 * Idempotent devnet bootstrap for the arena:
 *   1. initialize_arena on Solana (keeper keypair is the arena authority)
 *   2. delegate_arena to the MagicBlock devnet-as ER validator
 *   3. roll_round on the ER to open the first round (strike from the BTC/USD oracle)
 *   4. schedule_round_crank so the ER rolls rounds by itself
 *
 * Usage: bun run scripts/bootstrap-arena.ts
 */
import {
  ArenaInstructions,
  BTC_USD_FEED,
  DEVNET_ENDPOINTS,
  ROUND_OPEN,
  USD,
  accountLayer,
  arenaPda,
  crankTaskId,
  createConnections,
  explorerTxUrl,
  fetchArena,
  fetchOraclePrice,
  keypairSigner,
  sendBaseTransaction,
  sendErTransaction,
  waitForDelegation,
} from '../packages/arena-sdk/src/index'
import { loadKeypair } from './lib/keys'

const ROUND_SECONDS = 300
const LIQUIDITY = 200n * USD
const FEE_BPS = 100
const TREASURY_SEED = 1_000_000n * USD
const CRANK_INTERVAL_MS = 2_000
const CRANK_ITERATIONS = 200_000

async function main() {
  const keeper = loadKeypair('keeper')
  const connections = createConnections(DEVNET_ENDPOINTS)
  const instructions = new ArenaInstructions(connections.base)
  const arena = arenaPda()
  const signer = keypairSigner(keeper)
  const log = (step: string, detail: string) => console.log(`[bootstrap] ${step}: ${detail}`)

  log('authority', keeper.publicKey.toBase58())
  log('arena', arena.toBase58())
  const price = await fetchOraclePrice(connections.er, BTC_USD_FEED)
  log('oracle', `BTC/USD ${price.price.toFixed(2)} (published ${Math.round(Date.now() / 1000 - price.publishTime)}s ago, slot ${price.postedSlot})`)

  let layer = await accountLayer(connections.base, arena)
  if (layer === 'missing') {
    const ix = await instructions.initializeArena(keeper.publicKey, {
      oracleFeed: BTC_USD_FEED,
      keeper: keeper.publicKey,
      roundSeconds: ROUND_SECONDS,
      liquidity: LIQUIDITY,
      feeBps: FEE_BPS,
      treasurySeed: TREASURY_SEED,
    })
    const sent = await sendBaseTransaction(connections.base, [ix], signer)
    log('initialize_arena', explorerTxUrl(sent.signature, 'base'))
    layer = 'base'
  } else {
    log('initialize_arena', `skipped (arena already ${layer})`)
  }

  if (layer === 'base') {
    const ix = await instructions.delegateArena(keeper.publicKey, connections.endpoints.validator)
    const sent = await sendBaseTransaction(connections.base, [ix], signer)
    log('delegate_arena', explorerTxUrl(sent.signature, 'base'))
    await waitForDelegation(connections, arena, 60_000)
    log('delegation', 'arena is owned by the delegation program on Solana and live on the ER')
  } else {
    log('delegate_arena', 'skipped (already delegated)')
  }

  let state = await fetchArena(connections.er)
  if (state.current.status !== ROUND_OPEN) {
    const sent = await sendErTransaction(connections.er, [await instructions.rollRound()], keeper)
    log('roll_round (first round)', `${explorerTxUrl(sent.signature, 'er')} in ${Math.round(sent.ms)}ms`)
    state = await fetchArena(connections.er)
  } else {
    log('roll_round', `skipped (round ${state.current.id} already open until ${new Date(state.current.endTs * 1000).toISOString()})`)
  }

  const taskId = await crankTaskId(`rogs-arena:rounds:${arena.toBase58()}`)
  if (state.crankTaskId !== taskId) {
    const ix = await instructions.scheduleRoundCrank(keeper.publicKey, taskId, CRANK_INTERVAL_MS, CRANK_ITERATIONS)
    const sent = await sendErTransaction(connections.er, [ix], keeper)
    log('schedule_round_crank', `${explorerTxUrl(sent.signature, 'er')} task ${taskId}`)
    state = await fetchArena(connections.er)
  } else {
    log('schedule_round_crank', `skipped (task ${taskId} already recorded)`)
  }

  const summary = {
    programId: instructions.programId.toBase58(),
    arena: arena.toBase58(),
    authority: state.authority.toBase58(),
    oracleFeed: state.oracleFeed.toBase58(),
    round: {
      id: state.current.id,
      status: state.current.status,
      startTs: state.current.startTs,
      endTs: state.current.endTs,
      strike: state.current.strikePrice.toString(),
      priceExpo: state.current.priceExpo,
    },
    treasuryUsd: Number(state.treasury) / 1e6,
    crankTaskId: state.crankTaskId.toString(),
    lastRollTs: state.lastRollTs,
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('[bootstrap] FAILED:', error instanceof Error ? error.message : error)
  if (error && typeof error === 'object' && 'logs' in error) console.error((error as { logs: string[] }).logs.join('\n'))
  process.exit(1)
})
