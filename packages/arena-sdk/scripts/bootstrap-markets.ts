/**
 * Idempotent devnet bootstrap for coin markets 1..8 (market 0, BTC, is bootstrap-arena.ts):
 *   1. initialize_market on Solana, signed by the market 0 arena authority (keeper keypair)
 *   2. delegate_market to the MagicBlock devnet-as ER validator
 *   3. roll_round on the ER to open the first round (strike from that coin's oracle feed)
 *   4. schedule_round_crank so the ER rolls that market's rounds by itself
 *
 * Usage: bun run packages/arena-sdk/scripts/bootstrap-markets.ts [SYMBOL ...]
 */
import type { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import {
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  MARKETS,
  ROUND_OPEN,
  USD,
  accountLayer,
  arenaPda,
  crankTaskId,
  createConnections,
  explorerTxUrl,
  fetchArena,
  fetchOraclePrice,
  getDelegationStatus,
  keypairSigner,
  roundNumber,
  sendBaseTransaction,
  sendErTransaction,
  waitForDelegation,
  type ArenaConnections,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const ROUND_SECONDS = 300
const LIQUIDITY = 200n * USD
const FEE_BPS = 100
const TREASURY_SEED = 1_000_000n * USD
const CRANK_INTERVAL_MS = 2_000
const CRANK_ITERATIONS = 200_000
/** Arena rent (0.031 SOL) plus delegation accounts and fees. */
const MIN_AUTHORITY_LAMPORTS = 45_000_000
const ER_WRITABLE_ATTEMPTS = 40

/**
 * Right after delegation the ER can still hold its earlier undelegated clone of the arena and reject
 * it as writable (InvalidWritableAccount). Only that case is retried; any other error is thrown.
 */
async function sendErOnceWritable(connections: ArenaConnections, instructions: TransactionInstruction[], signer: Keypair, arena: PublicKey) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendErTransaction(connections.er, instructions, signer)
    } catch (error) {
      const logs = (error as { logs?: string[] }).logs ?? []
      const text = `${error instanceof Error ? error.message : String(error)}\n${logs.join('\n')}`
      if (!text.includes('InvalidWritableAccount') || attempt >= ER_WRITABLE_ATTEMPTS) throw error
      const status = await getDelegationStatus(DEVNET_ENDPOINTS.routerUrl, arena)
      console.log(`  ER does not accept ${arena.toBase58()} as writable yet (router isDelegated=${status.isDelegated}); retry ${attempt}/${ER_WRITABLE_ATTEMPTS} in 3s`)
      await Bun.sleep(3_000)
    }
  }
}

async function main() {
  const keeper = loadKeypair('keeper')
  const connections = createConnections(DEVNET_ENDPOINTS)
  const instructions = new ArenaInstructions(connections.base)
  const programId = instructions.programId
  const signer = keypairSigner(keeper)
  const wanted = process.argv.slice(2).map((symbol) => symbol.toUpperCase())
  const markets = MARKETS.filter((market) => market.id > 0 && (wanted.length === 0 || wanted.includes(market.symbol)))
  if (wanted.length && markets.length !== wanted.length) throw new Error(`Unknown or BTC symbol in ${wanted.join(', ')}`)

  const summary = []
  for (const market of markets) {
    const arena = arenaPda(programId, market.id)
    const log = (step: string, detail: string) => console.log(`[${market.symbol}] ${step}: ${detail}`)
    log('arena', arena.toBase58())

    const price = await fetchOraclePrice(connections.er, market.feed)
    const age = Math.round(Date.now() / 1000 - price.publishTime)
    log('oracle', `${market.symbol}/USD ${price.price.toFixed(market.priceDecimals)} (published ${age}s ago)`)

    let layer = await accountLayer(connections.base, arena, programId)
    if (layer === 'missing') {
      const lamports = await connections.base.getBalance(keeper.publicKey, 'confirmed')
      if (lamports < MIN_AUTHORITY_LAMPORTS) {
        throw new Error(`Authority ${keeper.publicKey.toBase58()} has ${lamports / 1e9} SOL; needs ${MIN_AUTHORITY_LAMPORTS / 1e9} per market`)
      }
      const ix = await instructions.initializeMarket(keeper.publicKey, market.id, {
        oracleFeed: market.feed,
        keeper: keeper.publicKey,
        roundSeconds: ROUND_SECONDS,
        liquidity: LIQUIDITY,
        feeBps: FEE_BPS,
        treasurySeed: TREASURY_SEED,
      })
      const sent = await sendBaseTransaction(connections.base, [ix], signer)
      log('initialize_market', explorerTxUrl(sent.signature, 'base'))
      layer = 'base'
    } else {
      log('initialize_market', `skipped (arena already ${layer})`)
    }

    if (layer === 'base') {
      const ix = await instructions.delegateMarket(keeper.publicKey, market.id, connections.endpoints.validator)
      const sent = await sendBaseTransaction(connections.base, [ix], signer)
      log('delegate_market', explorerTxUrl(sent.signature, 'base'))
      await waitForDelegation(connections, arena, 60_000, programId)
    } else {
      log('delegate_market', 'skipped (already delegated)')
    }

    let state = await fetchArena(connections.er, programId, market.id)
    if (state.market !== market.id) throw new Error(`Arena ${arena.toBase58()} stores market ${state.market}, expected ${market.id}`)
    if (!state.oracleFeed.equals(market.feed)) throw new Error(`Arena ${arena.toBase58()} reads feed ${state.oracleFeed.toBase58()}`)

    if (state.current.status !== ROUND_OPEN) {
      const sent = await sendErOnceWritable(connections, [await instructions.rollRound(market.id)], keeper, arena)
      log('roll_round (first round)', `${explorerTxUrl(sent.signature, 'er')} in ${Math.round(sent.ms)}ms`)
      state = await fetchArena(connections.er, programId, market.id)
    } else {
      log('roll_round', `skipped (round ${roundNumber(state.current.id)} already open)`)
    }

    const taskId = await crankTaskId(`rogs-arena:rounds:${arena.toBase58()}`)
    if (state.crankTaskId !== taskId) {
      const ix = await instructions.scheduleRoundCrank(keeper.publicKey, taskId, CRANK_INTERVAL_MS, CRANK_ITERATIONS, market.id)
      const sent = await sendErOnceWritable(connections, [ix], keeper, arena)
      log('schedule_round_crank', `${explorerTxUrl(sent.signature, 'er')} task ${taskId}`)
      state = await fetchArena(connections.er, programId, market.id)
    } else {
      log('schedule_round_crank', `skipped (task ${taskId} already recorded)`)
    }

    summary.push({
      market: market.symbol,
      arena: arena.toBase58(),
      roundId: state.current.id,
      round: roundNumber(state.current.id),
      status: state.current.status,
      endTs: state.current.endTs,
      strike: state.current.strikePrice.toString(),
      priceExpo: state.current.priceExpo,
      crankTaskId: state.crankTaskId.toString(),
    })
  }
  console.table(summary)
}

main().catch((error) => {
  console.error('[bootstrap-markets] FAILED:', error instanceof Error ? error.message : error)
  if (error && typeof error === 'object' && 'logs' in error) console.error((error as { logs: string[] }).logs.join('\n'))
  process.exit(1)
})
