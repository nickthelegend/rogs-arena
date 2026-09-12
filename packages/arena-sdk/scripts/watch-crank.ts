/**
 * Watches the arena on the ER until the current round rolls, with no keeper
 * involved, to prove the MagicBlock crank is executing roll_round.
 * Usage: bun run packages/arena-sdk/scripts/watch-crank.ts [timeoutSeconds]
 */
import { DEVNET_ENDPOINTS, createConnections, fetchArena } from '../src/index'

const connections = createConnections(DEVNET_ENDPOINTS)
const timeoutMs = Number(process.argv[2] ?? 420) * 1000
const now = () => Math.floor(Date.now() / 1000)
const start = await fetchArena(connections.er)
console.log(`start: round ${start.current.id} status ${start.current.status} ends in ${start.current.endTs - now()}s lastRoll ${start.lastRollTs}`)
const deadline = Date.now() + timeoutMs
let last = start
while (Date.now() < deadline) {
  await Bun.sleep(3_000)
  const arena = await fetchArena(connections.er)
  const changed = arena.current.id !== last.current.id || arena.lastRollTs !== last.lastRollTs || arena.current.status !== last.current.status
  if (!changed) continue
  const resolved = arena.history[0]
  console.log(
    `round ${arena.current.id} status ${arena.current.status} strike ${arena.current.strikePrice} ends ${arena.current.endTs} | lastRoll ${arena.lastRollTs} (${arena.lastRollTs - last.current.endTs}s after previous end) | resolved ${resolved ? `#${resolved.id} ${resolved.outcome === 1 ? 'YES' : 'NO'} close ${resolved.closePrice}` : '-'}`,
  )
  last = arena
  if (arena.current.id > start.current.id) {
    console.log('CRANK ROLLED THE ROUND')
    process.exit(0)
  }
}
console.log(`NO ROLL within ${timeoutMs / 1000}s (round ${last.current.id} ended ${now() - last.current.endTs}s ago)`)
process.exit(2)
