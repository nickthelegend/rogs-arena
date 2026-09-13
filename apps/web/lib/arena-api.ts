import { env } from '@/env'
import { errorMessage } from '@/lib/error'
import { DEFAULT_MARKET, type MarketSymbol } from '@/lib/markets'

// Contract: docs/ARENA-API.md. Amounts are USD chips, `t` fields are ms, `*Ts` fields are unix seconds,
// wallet addresses are case-sensitive base58. Market-scoped routes take `market=SOL`; round ids are namespaced
// (`market * 2^40 + n`). `market` on a row is optional because the single-market service never sent it: see
// `dtoMarket` in lib/markets.ts, which reads a missing ticker as BTC.

export type Outcome = 'YES' | 'NO'

export type RoundDto = {
  market?: string
  roundId: number
  startTs: number
  endTs: number
  strikePrice: string
  closePrice: string | null
  priceExpo: number
  outcome: Outcome | null
  yesPool: number
  noPool: number
  volume: number
  trades: number
  openedSig: string | null
  resolvedSig: string | null
}

export type TradeDto = {
  market?: string
  id: string
  sig: string
  roundId: number
  owner: string
  side: 'BUY' | 'SELL'
  outcome: Outcome
  amount: number
  shares: number
  price: number
  yesPrice: number
  fee: number
  realizedPnl: number
  ability: number
  t: number
}

export type PointDto = { market?: string; roundId: number; t: number; yes: number; no: number; source: 'chain' }

export type CloseDto = {
  market?: string
  id: string
  roundId: number
  trader: string
  outcome: Outcome
  exit: 'tp' | 'sl'
  profit: number
  shares: number
  t: number
}

export type SettlementDto = {
  market?: string
  id: string
  sig: string
  roundId: number
  owner: string
  outcome: Outcome
  payout: number
  profit: number
  ability: number
  bonus: number
  calm: boolean
  cheers: boolean
  t: number
}

export type TraderDto = {
  address: string
  name: string
  status: 'online' | 'offline'
  lastSeen: number
  heartRate: number | null
  heartRateAt: number | null
  isBot: boolean
}

export type ChatDto = { id: string; address: string; name: string; message: string; t: number }

export type CheersDto = {
  sig: string
  owner: string
  recipients: string[]
  amountEach: number
  randomness: string
  t: number
}

export type ProfileDto = { wallet: string; displayName: string | null; createdAt: number; updatedAt: number }

export type ArenaSnapshot = {
  market?: string
  round: RoundDto | null
  recentRounds: RoundDto[]
  trades: TradeDto[]
  points: PointDto[]
  closes: CloseDto[]
  traders: TraderDto[]
  anonymous: number
  online: number
  chat: ChatDto[]
  cheers: CheersDto[]
  serverTime: number
}

export type MarketDto = {
  market: string
  id: number
  name: string
  color: string
  priceDecimals: number
  arena: string
  oracleFeed: string
  available: boolean
  round: RoundDto | null
}

/** A stored MagicBlock oracle price: `t` is the feed's publish time in ms, `price` is USD. */
export type PricePointDto = { t: number; price: number }

export type HealthDto = {
  ok: boolean
  mongo: boolean
  er: boolean
  programId: string
  arena: { roundId: number; status: number | string; endTs: number } | null
  indexer: { lastSig: string | null; lastEventAt: number | null }
  keeper: { lastRollSig: string | null; lastRollAt: number | null }
}

export type AuthNonceDto = { nonce: string; message: string }

export type AuthVerifyDto = { token: string; wallet: string; expiresAt: number | string }

export type FaucetDto = { signature: string; lamports: number } | { skipped: true; balance: number }

export class ArenaApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ArenaApiError'
    this.status = status
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  token?: string
  signal?: AbortSignal
}

function apiBase() {
  return env.NEXT_PUBLIC_ARENA_API_URL.replace(/\/+$/, '')
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const error = (payload as { error?: unknown }).error
  return typeof error === 'string' && error.length > 0 ? error : null
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${apiBase()}${path}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new ArenaApiError(`The arena server is unreachable (${path}): ${errorMessage(error)}`, 0)
  }

  const text = await response.text()
  let payload: unknown = undefined
  let parsed = text.length === 0
  if (text.length > 0) {
    try {
      payload = JSON.parse(text)
      parsed = true
    } catch {
      parsed = false
    }
  }

  if (!response.ok) {
    const message = readError(payload) ?? `The arena server answered ${response.status} ${response.statusText} for ${path}`
    throw new ArenaApiError(message, response.status)
  }

  if (!parsed) {
    throw new ArenaApiError(`The arena server returned a response that is not JSON for ${path}`, response.status)
  }

  return payload as T
}

export function getHealth(signal?: AbortSignal) {
  return request<HealthDto>('/health', { signal })
}

/** Every coin market with its availability; a 404 means the service predates markets. */
export function getMarkets(signal?: AbortSignal) {
  return request<MarketDto[]>('/api/markets', { signal })
}

export function getArenaSnapshot(market: MarketSymbol, signal?: AbortSignal) {
  return request<ArenaSnapshot>(`/api/arena${query({ market })}`, { signal })
}

export function getRounds(limit = 96, market: MarketSymbol = DEFAULT_MARKET, signal?: AbortSignal) {
  const size = Math.min(200, Math.max(1, Math.floor(limit)))
  return request<RoundDto[]>(`/api/rounds${query({ market, limit: size })}`, { signal })
}

export function getTrades(roundId: number, market: MarketSymbol, signal?: AbortSignal) {
  return request<TradeDto[]>(`/api/trades${query({ market, roundId })}`, { signal })
}

export function getPoints(roundId: number, market: MarketSymbol, signal?: AbortSignal) {
  return request<PointDto[]>(`/api/points${query({ market, roundId })}`, { signal })
}

export function getCloses(roundId: number, market: MarketSymbol, signal?: AbortSignal) {
  return request<CloseDto[]>(`/api/closes${query({ market, roundId })}`, { signal })
}

/** The coin's stored oracle prices since `since` (ms), ascending; the service keeps 6 hours and returns at most 2,000. */
export function getPriceHistory(market: MarketSymbol, since: number, signal?: AbortSignal) {
  return request<PricePointDto[]>(`/api/prices${query({ market, since: Math.max(0, Math.floor(since)) })}`, { signal })
}

/** `owner` alone returns that wallet's settlements in every market. */
export function getSettlements(
  filter: { roundId?: number; owner?: string; market?: MarketSymbol } = {},
  signal?: AbortSignal,
) {
  const params = { market: filter.market, roundId: filter.roundId, owner: filter.owner }
  return request<SettlementDto[]>(`/api/settlements${query(params)}`, { signal })
}

export function getChat(limit = 50, signal?: AbortSignal) {
  return request<ChatDto[]>(`/api/chat${query({ limit })}`, { signal })
}

export function getCheers(limit = 20, signal?: AbortSignal) {
  return request<CheersDto[]>(`/api/cheers${query({ limit })}`, { signal })
}

/** Resolves to null when the wallet has no profile yet (404). */
export async function getProfile(wallet: string, signal?: AbortSignal) {
  try {
    return await request<ProfileDto>(`/api/profile/${encodeURIComponent(wallet)}`, { signal })
  } catch (error) {
    if (error instanceof ArenaApiError && error.status === 404) return null
    throw error
  }
}

export function updateProfile(token: string, displayName: string) {
  return request<ProfileDto>('/api/profile', { method: 'POST', token, body: { displayName } })
}

export function authNonce(wallet: string) {
  return request<AuthNonceDto>('/api/auth/nonce', { method: 'POST', body: { wallet } })
}

export function authVerify(wallet: string, signature: string) {
  return request<AuthVerifyDto>('/api/auth/verify', { method: 'POST', body: { wallet, signature } })
}

export function requestFaucet(token: string) {
  return request<FaucetDto>('/api/faucet', { method: 'POST', token, body: {} })
}
