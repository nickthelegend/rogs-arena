import { ArenaChain } from './chain'
import { connectDb, migrateMarkets } from './db'
import { env } from './env'
import { createFetchHandler } from './http'
import { Indexer } from './indexer'
import { Keeper } from './keeper'
import { PriceSampler } from './prices'
import { RealtimeHub, type SocketData } from './realtime'
import type { ServiceStatus } from './types'
import { errorMessage } from './util'

const status: ServiceStatus = {
  indexer: { enabled: env.INDEXER_ENABLED, lastSig: null, lastEventAt: null },
  keeper: { enabled: env.KEEPER_ENABLED, lastRollSig: null, lastRollAt: null },
  prices: { enabled: env.PRICE_SAMPLER_ENABLED, lastSampleAt: null },
}

const database = await connectDb(env.MONGODB_URI, env.MONGODB_DB)
console.log(`[boot] mongo connected, db ${env.MONGODB_DB}, indexes ready`)

// During a rolling deploy the previous instance keeps indexing without `market` for a short while after this one
// migrated at boot; a second pass stamps what it wrote.
const LATE_MIGRATION_MS = 3 * 60_000
const lateMigration = setTimeout(() => {
  migrateMarkets(database.cols).then(
    counts => {
      const stamped = Object.entries(counts).filter(([, count]) => count > 0)
      if (stamped.length) console.log(`[db] late market stamp: ${stamped.map(([name, count]) => `${name} ${count}`).join(', ')}`)
    },
    error => console.error(`[db] late market stamp failed: ${errorMessage(error)}`),
  )
}, LATE_MIGRATION_MS)

const chain = new ArenaChain(env)
console.log(
  `[boot] program ${chain.programId.toBase58()}, keeper ${chain.keeper.publicKey.toBase58()}, faucet ${chain.faucet.publicKey.toBase58()}, idl ${env.IDL_PATH}`,
)
console.log(`[boot] markets ${chain.markets.map(market => `${market.symbol}=${market.arena.toBase58()}`).join(' ')}`)

const hub = new RealtimeHub(database.cols)
const server = Bun.serve<SocketData>({
  port: env.PORT,
  maxRequestBodySize: 64 * 1024,
  fetch: createFetchHandler({ env, database, chain, hub, status }),
  websocket: hub.websocket,
})
hub.attach(server)
hub.start()
console.log(`[boot] http + ws listening on :${server.port} (cors: ${[...new Set([...env.CORS_ORIGIN, 'http://localhost:3000'])].join(', ')})`)

const indexer = env.INDEXER_ENABLED ? new Indexer(chain, database.cols, hub, status) : null
indexer?.start()
if (!indexer) console.log('[boot] indexer disabled')

const sampler = env.PRICE_SAMPLER_ENABLED ? new PriceSampler(chain.er, chain.markets, database.cols, status) : null
sampler?.start()
if (!sampler) console.log('[boot] price sampler disabled')

const keeper = env.KEEPER_ENABLED ? new Keeper(chain, database.cols, status, database.keeperLogCapped) : null
keeper?.start()
if (!keeper) console.log('[boot] keeper disabled')

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[boot] ${signal} received, shutting down`)
  clearTimeout(lateMigration)
  try {
    await keeper?.stop()
    await indexer?.stop()
    await sampler?.stop()
    hub.stop()
    await server.stop(true)
    await database.client.close()
  } catch (error) {
    console.error(`[boot] shutdown error: ${errorMessage(error)}`)
  }
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('unhandledRejection', reason => console.error(`[boot] unhandled rejection: ${errorMessage(reason)}`))
