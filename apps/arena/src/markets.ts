import { MARKET_ROUND_BASE, MARKETS, arenaPda } from '@rogs/arena-sdk'
import type { PublicKey } from '@solana/web3.js'

// Coin markets come from @rogs/arena-sdk so the service, the web app and the bootstrap scripts share one table.
// HTTP and WS use the ticker (`market`); the program uses the numeric id, which is the table index.
MARKETS.forEach((market, index) => {
  if (market.id !== index) throw new Error(`MARKETS[${index}] has id ${market.id}; ids must equal their index`)
})

export const MARKET_SYMBOLS: readonly string[] = MARKETS.map(market => market.symbol)
/** Requests without a `market` get BTC, the only market before multi-market support. */
export const DEFAULT_MARKET = 'BTC'

export type Market = {
  id: number
  symbol: string
  name: string
  color: string
  priceDecimals: number
  arena: PublicKey
  oracleFeed: PublicKey
}

export const isMarketSymbol = (value: string): boolean => MARKET_SYMBOLS.includes(value)

export const UNKNOWN_MARKET_MESSAGE = `market must be one of ${MARKET_SYMBOLS.join(', ')}`

/** Round ids are `market * 2^40 + n`; the market id sits in the high bits. */
export const marketIdOfRound = (roundId: number): number => Math.floor(roundId / MARKET_ROUND_BASE)

/** The per-market round counter (1, 2, 3, ...) inside a namespaced round id; 0 means no round has opened. */
export const roundNumberOf = (roundId: number): number => roundId % MARKET_ROUND_BASE

/** Ticker of the market a round id belongs to. Throws for ids outside the table rather than guessing. */
export function marketOfRound(roundId: number): string {
  const symbol = Number.isSafeInteger(roundId) && roundId >= 0 ? MARKET_SYMBOLS[marketIdOfRound(roundId)] : undefined
  if (symbol === undefined) throw new Error(`Round id ${roundId} belongs to no known market`)
  return symbol
}

/** The service's market table. BTC keeps reading ORACLE_BTC_FEED so existing deployments keep their configured feed. */
export function buildMarkets(programId: PublicKey, btcFeed: PublicKey): Market[] {
  return MARKETS.map(config => ({
    id: config.id,
    symbol: config.symbol,
    name: config.name,
    color: config.color,
    priceDecimals: config.priceDecimals,
    arena: arenaPda(programId, config.id),
    oracleFeed: config.id === 0 ? btcFeed : config.feed,
  }))
}
