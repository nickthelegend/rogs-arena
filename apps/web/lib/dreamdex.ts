import { type BinaryBookParams, type MarketOnchain } from '@somnia-chain/markets-sdk'

import {
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  SomniaMarkets,
  type SomniaMarketsConfig,
} from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'

export const dreamDexConfig = {
  indexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  chain: somniaShannon,
  wsRpcUrl: somniaShannon.rpcUrls.default.webSocket[0],
  addresses: SOMNIA_TESTNET_ADDRESSES,
  priceFeed: SOMNIA_TESTNET_PRICE_FEED,
} satisfies SomniaMarketsConfig

export function createDreamDexExchange(config: Partial<SomniaMarketsConfig> = {}) {
  return new SomniaMarkets({
    ...dreamDexConfig,
    ...config,
  })
}

const marketOnchainCache = new Map<string, { value: MarketOnchain; expiresAt: number }>()
const binaryBookParamsCache = new Map<string, { value: BinaryBookParams; expiresAt: number }>()

const activeMarketTtlMs = 15_000
const inactiveMarketTtlMs = 1_000
const bookParamsTtlMs = 5 * 60_000
const cacheMaxEntries = 300

function pruneCache<T>(cache: Map<string, { value: T; expiresAt: number }>) {
  if (cache.size < cacheMaxEntries) return

  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }

  while (cache.size >= cacheMaxEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

function readCache<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string) {
  const cached = cache.get(key.toLowerCase())
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key.toLowerCase())
    return null
  }

  return cached.value
}

export function getCachedMarketOnchain(marketId: string) {
  return readCache(marketOnchainCache, marketId)
}

export function setCachedMarketOnchain(marketId: string, value: MarketOnchain) {
  const now = Date.now()
  const expiryMs = Number(value.expiry) * 1000
  const ttl = value.status === 1 ? activeMarketTtlMs : inactiveMarketTtlMs
  const expiresAt = Number.isFinite(expiryMs) ? Math.min(now + ttl, expiryMs) : now + ttl

  if (expiresAt <= now) return

  pruneCache(marketOnchainCache)
  marketOnchainCache.set(marketId.toLowerCase(), { value, expiresAt })
}

export function getCachedBinaryBookParams(pool: string) {
  return readCache(binaryBookParamsCache, pool)
}

export function setCachedBinaryBookParams(pool: string, value: BinaryBookParams) {
  pruneCache(binaryBookParamsCache)
  binaryBookParamsCache.set(pool.toLowerCase(), {
    value,
    expiresAt: Date.now() + bookParamsTtlMs,
  })
}
