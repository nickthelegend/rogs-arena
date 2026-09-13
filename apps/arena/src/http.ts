import type { Server } from 'bun'
import { createNonce, requireWallet, verifyLogin } from './auth'
import type { ArenaChain, MarketArena } from './chain'
import { listChat } from './chat'
import type { Database } from './db'
import type { Env } from './env'
import { HttpError } from './errors'
import { requestFaucet } from './faucet'
import { DEFAULT_MARKET } from './markets'
import { listPrices } from './prices'
import type { RealtimeHub, SocketData } from './realtime'
import {
  arenaQuerySchema,
  chatQuerySchema,
  cheersQuerySchema,
  nonceBodySchema,
  parseInput,
  pricesQuerySchema,
  profileBodySchema,
  roundQuerySchema,
  roundsQuerySchema,
  settlementsQuerySchema,
  verifyBodySchema,
  walletSchema,
} from './schemas'
import { buildSnapshot, toHealthMarkets, toMarketDtos } from './snapshot'
import {
  getUser,
  latestRound,
  listCheers,
  listCloses,
  listPoints,
  listRounds,
  listSettlements,
  listTrades,
  toProfile,
  upsertProfile,
} from './store'
import type { ServiceStatus } from './types'
import { withTimeout } from './util'

export type HttpContext = {
  env: Env
  database: Database
  chain: ArenaChain
  hub: RealtimeHub
  status: ServiceStatus
}

type ArenaServer = Server<SocketData>
type Routed = { status?: number; data: unknown }

const LOCAL_ORIGIN = 'http://localhost:3000'
/** Arena reads for /health and /api/markets are shared for this long, so polling clients cost one ER call. */
const ARENA_READ_MAX_AGE_MS = 2_000
const KNOWN_PATHS = new Set([
  '/health',
  '/api/markets',
  '/api/arena',
  '/api/rounds',
  '/api/trades',
  '/api/points',
  '/api/closes',
  '/api/prices',
  '/api/settlements',
  '/api/chat',
  '/api/cheers',
  '/api/profile',
  '/api/auth/nonce',
  '/api/auth/verify',
  '/api/faucet',
])

function corsHeaders(origin: string | null, allowed: Set<string>): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (origin && (allowed.has(origin) || allowed.has('*'))) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    headers['Access-Control-Max-Age'] = '600'
  }
  return headers
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  Response.json(data, { status, headers: { ...headers, 'Cache-Control': 'no-store' } })

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

function clientIp(req: Request, server: ArenaServer): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || server.requestIP(req)?.address || 'unknown'
}

export function createFetchHandler(ctx: HttpContext) {
  const allowed = new Set([...ctx.env.CORS_ORIGIN, LOCAL_ORIGIN])

  return async (req: Request, server: ArenaServer): Promise<Response | undefined> => {
    const url = new URL(req.url)
    const cors = corsHeaders(req.headers.get('origin'), allowed)

    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req, {
        data: { connId: crypto.randomUUID(), sessionId: null, wallet: null, market: DEFAULT_MARKET },
      })
      return upgraded ? undefined : json({ error: 'Expected a WebSocket upgrade' }, 426, cors)
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    try {
      const routed = await route(ctx, req, url, server)
      return json(routed.data, routed.status ?? 200, cors)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status, cors)
      console.error(`[http] ${req.method} ${url.pathname} failed:`, error)
      return json({ error: 'Internal server error' }, 500, cors)
    }
  }
}

async function route(ctx: HttpContext, req: Request, url: URL, server: ArenaServer): Promise<Routed> {
  const { cols } = ctx.database
  const { pathname } = url
  const query = Object.fromEntries(url.searchParams)

  if (req.method === 'GET') {
    switch (pathname) {
      case '/health':
        return health(ctx)
      case '/api/markets': {
        const [arenas, rounds] = await Promise.all([
          readArenas(ctx),
          Promise.all(ctx.chain.markets.map(market => latestRound(cols, market.symbol))),
        ])
        return { data: toMarketDtos(ctx.chain.markets, arenas, rounds) }
      }
      case '/api/arena':
        return { data: await buildSnapshot(cols, ctx.hub.presence, parseInput(arenaQuerySchema, query).market) }
      case '/api/rounds': {
        const { market, limit } = parseInput(roundsQuerySchema, query)
        return { data: await listRounds(cols, market, limit) }
      }
      case '/api/trades': {
        const { market, roundId } = parseInput(roundQuerySchema, query)
        return { data: await listTrades(cols, market, roundId) }
      }
      case '/api/points': {
        const { market, roundId } = parseInput(roundQuerySchema, query)
        return { data: await listPoints(cols, market, roundId) }
      }
      case '/api/closes': {
        const { market, roundId } = parseInput(roundQuerySchema, query)
        return { data: await listCloses(cols, market, roundId) }
      }
      case '/api/prices': {
        const { market, since } = parseInput(pricesQuerySchema, query)
        return { data: await listPrices(cols, market, since) }
      }
      case '/api/settlements':
        return { data: await listSettlements(cols, parseInput(settlementsQuerySchema, query)) }
      case '/api/chat':
        return { data: await listChat(cols, parseInput(chatQuerySchema, query).limit) }
      case '/api/cheers':
        return { data: await listCheers(cols, parseInput(cheersQuerySchema, query).limit) }
    }
    const profilePath = pathname.match(/^\/api\/profile\/([^/]+)$/)
    if (profilePath?.[1]) {
      let raw: string
      try {
        raw = decodeURIComponent(profilePath[1])
      } catch {
        throw new HttpError(400, 'Invalid wallet address')
      }
      const wallet = parseInput(walletSchema, raw)
      const user = await getUser(cols, wallet)
      // A wallet that never saved a name is a normal first visit, not a missing resource.
      if (!user) return { data: { wallet, displayName: null, createdAt: 0, updatedAt: 0 } }
      return { data: toProfile(user) }
    }
  }

  if (req.method === 'POST') {
    switch (pathname) {
      case '/api/auth/nonce': {
        const { wallet } = parseInput(nonceBodySchema, await readJson(req))
        return { data: await createNonce(cols, wallet) }
      }
      case '/api/auth/verify': {
        const { wallet, signature } = parseInput(verifyBodySchema, await readJson(req))
        return { data: await verifyLogin(cols, wallet, signature) }
      }
      case '/api/profile': {
        const wallet = await requireWallet(cols, req)
        const { displayName } = parseInput(profileBodySchema, await readJson(req))
        const user = await upsertProfile(cols, wallet, displayName)
        ctx.hub.setProfile(wallet, user.displayName, user.isBot)
        return { data: toProfile(user) }
      }
      case '/api/faucet': {
        const wallet = await requireWallet(cols, req)
        return { data: await requestFaucet(cols, ctx.chain, wallet, clientIp(req, server)) }
      }
    }
  }

  if (KNOWN_PATHS.has(pathname) || pathname.startsWith('/api/profile/')) throw new HttpError(405, 'Method not allowed')
  throw new HttpError(404, 'Not found')
}

/** All market arenas from the ER (shared briefly across requests); null when the ER has never been readable. */
const readArenas = (ctx: HttpContext): Promise<MarketArena[] | null> =>
  withTimeout(ctx.chain.readArenas(ARENA_READ_MAX_AGE_MS), 4_000, 'arena read').then(
    arenas => arenas,
    () => null,
  )

async function health(ctx: HttpContext): Promise<Routed> {
  const [mongo, er, arenas] = await Promise.all([
    withTimeout(ctx.database.db.command({ ping: 1 }), 3_000, 'mongo ping').then(
      () => true,
      () => false,
    ),
    withTimeout(ctx.chain.er.getSlot(), 3_000, 'er slot').then(
      () => true,
      () => false,
    ),
    readArenas(ctx),
  ])
  const markets = toHealthMarkets(ctx.chain.markets, arenas)
  // `arena` is BTC's row in the pre-multi-market shape.
  const btc = markets.find(market => market.market === DEFAULT_MARKET)
  const arena = btc?.available ? { roundId: btc.roundId, status: btc.status, endTs: btc.endTs } : null
  return {
    status: mongo ? 200 : 503,
    data: {
      ok: mongo,
      mongo,
      er,
      programId: ctx.chain.programId.toBase58(),
      arena,
      markets,
      indexer: { ...ctx.status.indexer },
      keeper: { ...ctx.status.keeper },
    },
  }
}
