/**
 * MK-05 guards on devnet for the multi-market program. Every case must be rejected by the program
 * and leave state unchanged:
 *   - a stranger cannot open a market (initialize_market checks the BTC arena's stored authority)
 *   - the authority cannot open "market 0" under the new seeds
 *   - an existing market cannot be initialized twice
 *   - a non-Arena account passed as the arena is rejected (trade contexts no longer seed-check it)
 *   - a stranger cannot schedule or fund another market's arena
 * Usage: bun run packages/arena-sdk/scripts/test-market-guards.ts (after bootstrap-markets.ts)
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import {
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  MARKETS,
  OUTCOME_YES,
  PROGRAM_ID,
  USD,
  accountLayer,
  arenaPda,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  playerPda,
  sendBaseTransaction,
  sendErTransaction,
} from '../src/index'
import { loadKeypair } from './lib/keys'

const c = createConnections(DEVNET_ENDPOINTS)
const ix = new ArenaInstructions(c.base)
let failures = 0
const record = (id: string, check: string, ok: boolean, detail: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}: ${detail}`)
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function expectRejected(id: string, check: string, send: () => Promise<unknown>, expected: RegExp, unchanged: () => Promise<boolean>) {
  try {
    await send()
    record(id, check, false, 'transaction unexpectedly succeeded')
  } catch (error) {
    const text = message(error)
    const same = await unchanged()
    record(id, check, expected.test(text) && same, `rejected: "${text.slice(0, 160)}"; state unchanged: ${same}`)
  }
}

const keeper = loadKeypair('keeper')
const deployer = loadKeypair('deployer')
const stranger = Keypair.generate()
await sendBaseTransaction(
  c.base,
  [SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: stranger.publicKey, lamports: 0.06 * LAMPORTS_PER_SOL })],
  keypairSigner(deployer),
)
const sol = MARKETS[2]
const config = { oracleFeed: sol.feed, keeper: stranger.publicKey, roundSeconds: 300, liquidity: 200n * USD, feeBps: 100, treasurySeed: 1_000_000n * USD }
const base = (instruction: TransactionInstruction, signer: Keypair) => sendBaseTransaction(c.base, [instruction], keypairSigner(signer))

// A market id nobody has opened, so a successful init would really create it.
const spare = 200
await expectRejected(
  'MK-05', 'stranger cannot open a market',
  async () => base(await ix.initializeMarket(stranger.publicKey, spare, config), stranger),
  /not allowed to act/,
  async () => (await accountLayer(c.base, arenaPda(PROGRAM_ID, spare))) === 'missing',
)

await expectRejected(
  'MK-05', 'authority cannot open market 0 under the new seeds',
  async () => {
    // The SDK maps market 0 to the original ["arena"] PDA; only ["arena", [0]] reaches the handler's market > 0 check.
    const instruction = await ix.initializeMarket(keeper.publicKey, 0, { ...config, keeper: keeper.publicKey })
    const [marketZeroSeeds] = PublicKey.findProgramAddressSync([Buffer.from('arena'), Uint8Array.of(0)], PROGRAM_ID)
    const index = instruction.keys.findIndex((key) => key.pubkey.equals(arenaPda(PROGRAM_ID, 0)) && key.isWritable)
    instruction.keys[index] = { ...instruction.keys[index], pubkey: marketZeroSeeds }
    return base(instruction, keeper)
  },
  /Invalid arena configuration/,
  async () => {
    const [marketZeroSeeds] = PublicKey.findProgramAddressSync([Buffer.from('arena'), Uint8Array.of(0)], PROGRAM_ID)
    return (await accountLayer(c.base, marketZeroSeeds)) === 'missing'
  },
)

const solBefore = await fetchArena(c.er, PROGRAM_ID, sol.id)
await expectRejected(
  'MK-05', 'existing SOL market cannot be initialized again',
  async () => base(await ix.initializeMarket(keeper.publicKey, sol.id, { ...config, keeper: keeper.publicKey }), keeper),
  /already in use/,
  async () => {
    const after = await fetchArena(c.er, PROGRAM_ID, sol.id)
    return after.oracleFeed.equals(solBefore.oracleFeed) && after.authority.equals(solBefore.authority)
  },
)

await expectRejected(
  'MK-05', 'stranger cannot schedule a crank on the SOL arena',
  async () => sendErTransaction(c.er, [await ix.scheduleRoundCrank(stranger.publicKey, 42n, 2_000, 10, sol.id)], stranger),
  /not allowed to act/,
  async () => (await fetchArena(c.er, PROGRAM_ID, sol.id)).crankTaskId === solBefore.crankTaskId,
)

await expectRejected(
  'MK-05', 'stranger cannot fund the SOL treasury',
  async () => sendErTransaction(c.er, [await ix.fundTreasury(stranger.publicKey, 1n * USD, sol.id)], stranger),
  /not allowed to act/,
  async () => (await fetchArena(c.er, PROGRAM_ID, sol.id)).treasury >= solBefore.treasury,
)

// Trade contexts accept any Arena account, so a program-owned account of another type posing as the arena
// (the stranger's own delegated Player) must fail the discriminator check.
await ensurePlayerDelegated(c, ix, keypairSigner(stranger))
const session = await createSessionKey(c, ix, keypairSigner(stranger), 1)
await sendErTransaction(c.er, [await ix.claimChips(session.keypair.publicKey, stranger.publicKey, session.token, sol.id)], session.keypair)
const buy = await ix.buy(session.keypair.publicKey, stranger.publicKey, OUTCOME_YES, 5n * USD, 0n, 0, session.token, sol.id)
const arenaIndex = buy.keys.findIndex((key) => key.pubkey.equals(arenaPda(PROGRAM_ID, sol.id)))
buy.keys[arenaIndex] = { ...buy.keys[arenaIndex], pubkey: playerPda(stranger.publicKey, PROGRAM_ID) }
const balanceBefore = (await fetchPlayer(c.er, stranger.publicKey))!.balance
await expectRejected(
  'MK-05', 'a Player account posing as the arena is rejected',
  async () => sendErTransaction(c.er, [buy], session.keypair),
  /discriminator/i,
  async () => (await fetchPlayer(c.er, stranger.publicKey))!.balance === balanceBefore,
)

console.log(failures ? `MARKET GUARDS FAILED: ${failures}` : 'ALL MARKET GUARDS PASSED')
process.exit(failures ? 1 : 0)
