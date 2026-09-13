/**
 * MK-01..MK-04: every coin market is a live, delegated arena with its own oracle and crank.
 *   MK-01 base owner is the delegation program, ER owner is rogs_arena, router says delegated
 *   MK-02 arena stores the right market id and oracle feed
 *   MK-03 a round is open with a strike, and the feed is fresh on the ER
 *   MK-04 (with `watch`) the MagicBlock crank rolls every market's round with no manual roll_round
 * Usage: bun run packages/arena-sdk/scripts/check-markets.ts [watch]
 */
import {
  DELEGATION_PROGRAM_ID,
  DEVNET_ENDPOINTS,
  MARKETS,
  PROGRAM_ID,
  ROUND_OPEN,
  arenaPda,
  crankTaskId,
  createConnections,
  fetchArena,
  fetchOraclePrice,
  getDelegationStatus,
  roundNumber,
} from '../src/index'

const c = createConnections(DEVNET_ENDPOINTS)
const now = () => Math.floor(Date.now() / 1000)
const watch = process.argv[2] === 'watch'
let failures = 0
const record = (id: string, symbol: string, ok: boolean, detail: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${symbol}: ${detail}`)
}

const opened = new Map<number, { roundId: number; endTs: number }>()
for (const market of MARKETS) {
  const arena = arenaPda(PROGRAM_ID, market.id)
  const [base, er, router] = await Promise.all([
    c.base.getAccountInfo(arena, 'confirmed'),
    c.er.getAccountInfo(arena, 'confirmed'),
    getDelegationStatus(DEVNET_ENDPOINTS.routerUrl, arena),
  ])
  const delegated = Boolean(base?.owner.equals(DELEGATION_PROGRAM_ID) && er?.owner.equals(PROGRAM_ID) && router.isDelegated)
  record('MK-01', market.symbol, delegated, `arena ${arena.toBase58()} base owner ${base?.owner.toBase58() ?? 'missing'} | ER owner ${er?.owner.toBase58() ?? 'missing'} | router isDelegated=${router.isDelegated}`)
  if (!er) continue

  const state = await fetchArena(c.er, PROGRAM_ID, market.id)
  record('MK-02', market.symbol, state.market === market.id && state.oracleFeed.equals(market.feed), `market ${state.market} feed ${state.oracleFeed.toBase58()} (expected ${market.feed.toBase58()})`)

  const price = await fetchOraclePrice(c.er, market.feed)
  const age = now() - price.publishTime
  const open = state.current.status === ROUND_OPEN && state.current.strikePrice > 0n
  const expectedTask = await crankTaskId(`rogs-arena:rounds:${arena.toBase58()}`)
  record(
    'MK-03',
    market.symbol,
    open && age <= 30,
    `round #${roundNumber(state.current.id)} (id ${state.current.id}) status ${state.current.status} strike ${state.current.strikePrice} e${-state.current.priceExpo} ends in ${state.current.endTs - now()}s | oracle ${price.price.toFixed(market.priceDecimals)} age ${age}s | crank task ${state.crankTaskId}${state.crankTaskId === expectedTask ? ' (bootstrap id)' : ''} lastRoll ${now() - state.lastRollTs}s ago`,
  )
  opened.set(market.id, { roundId: state.current.id, endTs: state.current.endTs })
}

if (watch && opened.size) {
  const deadline = Math.max(...[...opened.values()].map((round) => round.endTs)) + 60
  console.log(`watching ${opened.size} markets until ${new Date(deadline * 1000).toISOString()} for crank rolls`)
  const pending = new Map(opened)
  while (pending.size && now() < deadline) {
    await Bun.sleep(3_000)
    for (const [id, round] of pending) {
      const state = await fetchArena(c.er, PROGRAM_ID, id)
      if (state.current.id <= round.roundId) continue
      const resolved = state.history.find((summary) => summary.id === round.roundId)
      const lag = state.lastRollTs - round.endTs
      record('MK-04', MARKETS[id].symbol, Boolean(resolved) && lag <= 30, `round #${roundNumber(round.roundId)} resolved ${resolved?.outcome === 1 ? 'UP' : resolved ? 'DOWN' : '?'} close ${resolved?.closePrice ?? '-'}, rolled ${lag}s after end, new round #${roundNumber(state.current.id)}`)
      pending.delete(id)
    }
  }
  for (const id of pending.keys()) record('MK-04', MARKETS[id].symbol, false, `round did not roll by ${new Date(deadline * 1000).toISOString()}`)
}

console.log(failures ? `MARKETS FAILED: ${failures}` : 'ALL MARKETS PASSED')
process.exit(failures ? 1 : 0)
