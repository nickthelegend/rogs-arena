import {
  MARKETS,
  marketBySymbol,
  marketOfRound,
  ROUND_OPEN,
  roundNumber,
  type MarketConfig,
  type PositionState,
} from '@rogs/arena-sdk'
import type { PublicKey } from '@solana/web3.js'

// Coin markets as the web app sees them. The SDK's MARKETS is the source of truth for ids, feeds and colors;
// this module adds the ticker used by the arena API (`market=SOL`), selection persistence and the rules for
// which rows and positions belong to which market.

export const MARKET_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX', 'LINK'] as const
export type MarketSymbol = (typeof MARKET_SYMBOLS)[number]

export const DEFAULT_MARKET: MarketSymbol = 'BTC'
export const MARKET_STORAGE_KEY = 'rogs.market'
export const MARKET_QUERY_PARAM = 'market'

export function parseMarketSymbol(value: unknown): MarketSymbol | null {
  if (typeof value !== 'string') return null
  const symbol = value.trim().toUpperCase()
  return (MARKET_SYMBOLS as readonly string[]).includes(symbol) ? (symbol as MarketSymbol) : null
}

export function marketConfig(symbol: MarketSymbol): MarketConfig {
  const config = marketBySymbol(symbol)
  if (!config) throw new Error(`Unknown market ${symbol}`)
  return config
}

export function marketSymbolById(id: number): MarketSymbol | null {
  return parseMarketSymbol(MARKETS.find((market) => market.id === id)?.symbol)
}

/** The coin a namespaced round id (`market * 2^40 + n`) belongs to, or null for an unknown market. */
export function marketSymbolOfRound(roundId: number): MarketSymbol | null {
  if (!Number.isSafeInteger(roundId) || roundId < 0) return null
  return marketSymbolById(marketOfRound(roundId))
}

/** How a round is named to people: the coin and its per-market counter, never the namespaced id. */
export function formatRoundLabel(roundId: number) {
  const symbol = marketSymbolOfRound(roundId)
  return symbol ? `${symbol} round ${roundNumber(roundId)}` : `round ${roundId}`
}

/** BTC's feed can be overridden by NEXT_PUBLIC_ORACLE_BTC_FEED; the other coins use the SDK's oracle PDAs. */
export function marketOracleFeed(config: MarketConfig, btcFeed: PublicKey) {
  return config.id === 0 ? btcFeed : config.feed
}

export function marketUnavailableReason(symbol: MarketSymbol) {
  return `${symbol} rounds are not open yet: its arena account is not on the MagicBlock rollup.`
}

// ---------------------------------------------------------------------------------------------------------------
// Selection: `?market=SOL` wins, then the saved choice, then BTC.
// ---------------------------------------------------------------------------------------------------------------

export type MarketSelectionSource = 'url' | 'storage' | 'default'

export function marketFromSearch(search: string) {
  try {
    return parseMarketSymbol(new URLSearchParams(search).get(MARKET_QUERY_PARAM))
  } catch {
    return null
  }
}

export function resolveMarketSelection(input: { search: string; stored: string | null }): {
  symbol: MarketSymbol
  source: MarketSelectionSource
} {
  const fromUrl = marketFromSearch(input.search)
  if (fromUrl) return { symbol: fromUrl, source: 'url' }
  const fromStorage = parseMarketSymbol(input.stored)
  if (fromStorage) return { symbol: fromStorage, source: 'storage' }
  return { symbol: DEFAULT_MARKET, source: 'default' }
}

type StorageGetter<T> = () => T | null | undefined

/** `getStorage` is a getter because reading `window.localStorage` itself throws when site data is blocked. */
export function readStoredMarket(getStorage: StorageGetter<Pick<Storage, 'getItem'>>): string | null {
  try {
    return getStorage()?.getItem(MARKET_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export function writeStoredMarket(getStorage: StorageGetter<Pick<Storage, 'setItem'>>, symbol: MarketSymbol) {
  try {
    const storage = getStorage()
    if (!storage) return false
    storage.setItem(MARKET_STORAGE_KEY, symbol)
    return true
  } catch {
    return false
  }
}

/** The same URL (path, other params, hash) with `market` set; returned relative, for history.replaceState. */
export function urlWithMarket(href: string, symbol: MarketSymbol) {
  const url = new URL(href)
  url.searchParams.set(MARKET_QUERY_PARAM, symbol)
  return `${url.pathname}${url.search}${url.hash}`
}

// ---------------------------------------------------------------------------------------------------------------
// Rows from the arena service
// ---------------------------------------------------------------------------------------------------------------

/**
 * The market a service row belongs to. The single-market service sent no `market`, and everything it indexed was
 * BTC, so a missing ticker is BTC. A ticker this client does not know matches no market.
 */
export function dtoMarket(dto: { market?: unknown }): MarketSymbol | null {
  if (dto.market == null || dto.market === '') return DEFAULT_MARKET
  return parseMarketSymbol(dto.market)
}

export function isInMarket(dto: { market?: unknown }, symbol: MarketSymbol) {
  return dtoMarket(dto) === symbol
}

// ---------------------------------------------------------------------------------------------------------------
// Positions across markets. A player's 4 slots are shared by every coin; settle_player and report_heart act on the
// slots whose round belongs to the arena they are sent with.
// ---------------------------------------------------------------------------------------------------------------

export type MarketRoundClock = { id: number; status: number; endTs: number }

/** Latest known round per market id. A missing entry means unknown, not closed. */
export type MarketRounds = Readonly<Partial<Record<number, MarketRoundClock | null>>>

type Slot = Pick<PositionState, 'roundId' | 'active'>

const knownMarketIds = new Set(MARKETS.map((market) => market.id))

function slotMarket(slot: Slot) {
  if (!slot.active || !Number.isSafeInteger(slot.roundId) || slot.roundId <= 0) return null
  const market = marketOfRound(slot.roundId)
  return knownMarketIds.has(market) ? market : null
}

function isOpenRound(clock: MarketRoundClock | null | undefined, roundId: number, nowSeconds: number) {
  return Boolean(clock && clock.id === roundId && clock.status === ROUND_OPEN && nowSeconds < clock.endTs)
}

/**
 * Active positions that are not in their market's still-running round, so settle_player can pay them out.
 * settle_player skips rounds that have not resolved, so a slot picked from a stale clock costs one no-op
 * instruction, never a wrong payout.
 */
export function positionsToSettle<T extends Slot>(
  positions: readonly T[],
  rounds: MarketRounds,
  nowSeconds: number,
  options: { exclude?: number | null } = {},
) {
  return positions.filter((slot) => {
    const market = slotMarket(slot)
    if (market == null || market === options.exclude) return false
    return !isOpenRound(rounds[market], slot.roundId, nowSeconds)
  })
}

/** The markets to send `settle_player` with (one instruction each), in market id order. */
export function marketsToSettle(
  positions: readonly Slot[],
  rounds: MarketRounds,
  nowSeconds: number,
  options: { exclude?: number | null } = {},
) {
  const markets = new Set<number>()
  for (const slot of positionsToSettle(positions, rounds, nowSeconds, options)) {
    const market = slotMarket(slot)
    if (market != null) markets.add(market)
  }
  return [...markets].sort((left, right) => left - right)
}

/**
 * Markets to send `report_heart` with: those holding a position in their running round (unknown clocks count, so a
 * slow board never drops a calm sample). With no such position the reading still goes on-chain via `fallback`.
 */
export function heartReportMarkets(
  positions: readonly Slot[],
  rounds: MarketRounds,
  nowSeconds: number,
  fallback: number,
) {
  const markets = new Set<number>()
  for (const slot of positions) {
    const market = slotMarket(slot)
    if (market == null) continue
    const clock = rounds[market]
    if (clock && !isOpenRound(clock, slot.roundId, nowSeconds)) continue
    markets.add(market)
  }
  if (markets.size === 0) markets.add(fallback)
  return [...markets].sort((left, right) => left - right)
}
