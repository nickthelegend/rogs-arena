import { ArenaChain } from './chain'
import { connectDb } from './db'
import { env } from './env'
import { createFetchHandler } from './http'
import { Indexer } from './indexer'
import { Keeper } from './keeper'
import { RealtimeHub, type SocketData } from './realtime'
import type { ServiceStatus } from './types'
import { errorMessage } from './util'

const status: ServiceStatus = {
  indexer: { lastSig: null, lastEventAt: null },
  keeper: { lastRollSig: null, lastRollAt: null },
}

const database = await connectDb(env.MONGODB_URI, env.MONGODB_DB)
console.log(`[boot] mongo connected, db ${env.MONGODB_DB}, indexes ready`)

const chain = new ArenaChain(env)
console.log(
  `[boot] program ${chain.programId.toBase58()}, arena ${chain.arena.toBase58()}, keeper ${chain.keeper.publicKey.toBase58()}, faucet ${chain.faucet.publicKey.toBase58()}, idl ${env.IDL_PATH}`,
)

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

const keeper = env.KEEPER_ENABLED ? new Keeper(chain, database.cols, status, database.keeperLogCapped) : null
keeper?.start()
if (!keeper) console.log('[boot] keeper disabled')

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[boot] ${signal} received, shutting down`)
  try {
    await keeper?.stop()
    await indexer?.stop()
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
