/**
 * CH-18/CH-19: deterministic Double Profit and Protect Loss settlements on devnet.
 * D buys YES $5 with Double; W pushes YES up $60; D sells into it (profit).
 * P buys YES $5 with Protect; W pushes NO $90 (YES falls); P sells into it (loss).
 * After the crank rolls the round, settle both and check bonus == min(|profit|, 10).
 */
import { appendFileSync } from 'node:fs'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'
import {
  ABILITY_CAP,
  ABILITY_DOUBLE,
  ABILITY_LOCK_SECONDS,
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
  parseArenaEvents,
  positionForRound,
  sendBaseTransaction,
  sendErTransaction,
  waitFor,
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
  rows.push(`| ${id} | ${check} | ${ok ? 'PASS' : 'FAIL'} | ${detail} |`)
}

const deployer = loadKeypair('deployer')
const [d, p, w] = [Keypair.generate(), Keypair.generate(), Keypair.generate()]
await sendBaseTransaction(c.base, [d, p, w].map((k) => SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: k.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })), keypairSigner(deployer))
const s: Record<string, Awaited<ReturnType<typeof createSessionKey>>> = {}
for (const [name, key] of [['d', d], ['p', p], ['w', w]] as const) {
  await ensurePlayerDelegated(c, ix, keypairSigner(key))
  s[name] = await createSessionKey(c, ix, keypairSigner(key), 2)
  await sendErTransaction(c.er, [await ix.claimChips(s[name].keypair.publicKey, key.publicKey, s[name].token)], s[name].keypair)
}
const act = async (name: 'd' | 'p' | 'w', key: Keypair, build: (signer: typeof key.publicKey, token: typeof key.publicKey) => Promise<any>) =>
  sendErTransaction(c.er, [await build(s[name].keypair.publicKey, s[name].token)], s[name].keypair)

let arena = await fetchArena(c.er)
if (arena.current.status !== ROUND_OPEN || arena.current.endTs - now() < ABILITY_LOCK_SECONDS + 45) {
  const previous = arena.current.id
  arena = await waitFor(async () => {
    const next = await fetchArena(c.er)
    return next.current.id > previous && next.current.status === ROUND_OPEN ? next : null
  }, { timeoutMs: (arena.current.endTs - now() + 120) * 1000, intervalMs: 2_000, label: 'fresh round' })
}
const roundId = arena.current.id

await act('d', d, (signer, token) => ix.buy(signer, d.publicKey, OUTCOME_YES, 5n * USD, 0n, ABILITY_DOUBLE, token))
await act('w', w, (signer, token) => ix.buy(signer, w.publicKey, OUTCOME_YES, 60n * USD, 0n, 0, token))
const dShares = positionForRound(await fetchPlayer(c.er, d.publicKey), roundId)!.yesShares
await act('d', d, (signer, token) => ix.sell(signer, d.publicKey, OUTCOME_YES, dShares, 0n, token))

await act('p', p, (signer, token) => ix.buy(signer, p.publicKey, OUTCOME_YES, 5n * USD, 0n, ABILITY_PROTECT, token))
await act('w', w, (signer, token) => ix.buy(signer, w.publicKey, OUTCOME_NO, 90n * USD, 0n, 0, token))
const pShares = positionForRound(await fetchPlayer(c.er, p.publicKey), roundId)!.yesShares
await act('p', p, (signer, token) => ix.sell(signer, p.publicKey, OUTCOME_YES, pShares, 0n, token))

const dPos = positionForRound(await fetchPlayer(c.er, d.publicKey), roundId)!
const pPos = positionForRound(await fetchPlayer(c.er, p.publicKey), roundId)!
console.log(`positions sold out: D proceeds ${Number(dPos.proceeds) / 1e6} (cost 5), P proceeds ${Number(pPos.proceeds) / 1e6} (cost 5)`)

const endTs = arena.current.endTs
await waitFor(async () => ((await fetchArena(c.er)).current.id > roundId ? true : null), { timeoutMs: (endTs - now() + 90) * 1000, intervalMs: 2_000, label: 'round roll' })

for (const [label, key, pos, ability] of [['Double Profit', d, dPos, ABILITY_DOUBLE], ['Protect Loss', p, pPos, ABILITY_PROTECT]] as const) {
  const before = (await fetchPlayer(c.er, key.publicKey))!.balance
  const sent = await sendErTransaction(c.er, [await ix.settlePlayer(key.publicKey)], w)
  const tx = await c.er.getTransaction(sent.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  const event = parseArenaEvents(tx?.meta?.logMessages ?? []).find((e) => e.name === 'PositionSettled')
  const after = (await fetchPlayer(c.er, key.publicKey))!.balance
  const profit = pos.proceeds - pos.cost
  const expectedBonus = ability === ABILITY_DOUBLE ? (profit > 0n ? (profit < ABILITY_CAP ? profit : ABILITY_CAP) : 0n) : (profit < 0n ? (-profit < ABILITY_CAP ? -profit : ABILITY_CAP) : 0n)
  const ok = event?.name === 'PositionSettled' && event.data.profit === profit && event.data.bonus === expectedBonus && after - before === expectedBonus && expectedBonus > 0n
  record('CH-19', `${label} bonus`, ok, `profit ${Number(profit) / 1e6} USD, bonus ${event?.name === 'PositionSettled' ? Number(event.data.bonus) / 1e6 : '?'} (expected ${Number(expectedBonus) / 1e6}), balance delta ${Number(after - before) / 1e6}, tx ${sent.signature}`)
}

appendFileSync(new URL('../../../docs/TEST-RUN-CHAIN.md', import.meta.url), ['', '## Ability bonuses (deterministic)', '', `Run at ${new Date().toISOString()}, round ${roundId}.`, '', '| Plan ID | Check | Result | Observed |', '|---|---|---|---|', ...rows, ''].join('\n'))
console.log(failures ? `ABILITIES FAILED: ${failures}` : 'ABILITY BONUSES PASSED')
process.exit(failures ? 1 : 0)
