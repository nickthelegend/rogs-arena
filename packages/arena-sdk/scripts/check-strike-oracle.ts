/**
 * CH-04: samples the MagicBlock BTC/USD feed every ~50ms through the next round
 * roll, then checks the new round's strike equals a feed price published within
 * 10s of last_roll_ts.
 */
import { BTC_USD_FEED, DEVNET_ENDPOINTS, createConnections, decodePriceUpdate, fetchArena } from '../src/index'
const c = createConnections(DEVNET_ENDPOINTS)
const start = await fetchArena(c.er)
const seen = new Map<string, number>()
const unsubscribe = c.er.onAccountChange(BTC_USD_FEED, (account) => {
  try {
    const price = decodePriceUpdate(BTC_USD_FEED, account.data, account.owner)
    seen.set(price.raw.toString(), price.publishTime)
  } catch {}
}, { commitment: 'confirmed' })
const deadline = Date.now() + (start.current.endTs - Math.floor(Date.now() / 1000) + 90) * 1000
let rolled = start
while (Date.now() < deadline) {
  await Bun.sleep(1_000)
  const next = await fetchArena(c.er)
  if (next.current.id > start.current.id) { rolled = next; break }
}
await Bun.sleep(1_500)
void c.er.removeAccountChangeListener(unsubscribe)
if (rolled.current.id === start.current.id) { console.log('FAIL CH-04: round did not roll'); process.exit(1) }
const strike = rolled.current.strikePrice.toString()
const resolved = rolled.history.find((round) => round.id === start.current.id)
const strikeSeenAt = seen.get(strike)
const closeSeenAt = resolved ? seen.get(resolved.closePrice.toString()) : undefined
const ok = strikeSeenAt !== undefined && Math.abs(strikeSeenAt - rolled.lastRollTs) <= 10 && resolved !== undefined && resolved.closePrice === rolled.current.strikePrice
console.log(`${ok ? 'PASS' : 'FAIL'} CH-04 round ${rolled.current.id}: strike ${strike} seen in feed at publish ${strikeSeenAt} (roll ${rolled.lastRollTs}); round ${start.current.id} close ${resolved?.closePrice} ${closeSeenAt !== undefined ? 'also seen in feed' : 'not sampled'}; ${seen.size} feed updates sampled`)
process.exit(ok ? 0 : 1)
