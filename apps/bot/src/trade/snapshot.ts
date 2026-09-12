import { discoverCurrentMarket, type IntervalOption } from '@/market'
import { isBinaryMarket, type BinaryBookParams, type BinaryOrderBook, type MarketOnchain, type SomniaMarkets, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { formatUnits } from 'viem'
import type { BookPrices } from './types'

export type MarketSnapshot = {
  market: UnifiedMarket
  onchain: MarketOnchain
  book: BinaryOrderBook
  bookParams: BinaryBookParams
  prices: BookPrices
}

const marketTtlMs = 5_000
const bookTtlMs = 1_250
const bookParamsTtlMs = 5 * 60_000

export function createMarketTape(exchange: SomniaMarkets, window: IntervalOption) {
  let market: UnifiedMarket | undefined
  let onchain: MarketOnchain | undefined
  let book: BinaryOrderBook | undefined
  let bookParams: BinaryBookParams | undefined
  let marketAt = 0
  let bookAt = 0
  let paramsAt = 0

  async function refreshMarket(now: number) {
    const next = await discoverCurrentMarket(exchange, window)
    if (!next || !isBinaryMarket(next.info)) {
      market = undefined
      onchain = undefined
      book = undefined
      return null
    }

    const rolled = market?.id !== next.id
    market = next
    onchain = await exchange.client.getMarketOnchain(next.info.marketId)
    marketAt = now
    if (rolled) {
      book = undefined
      bookParams = undefined
      bookAt = 0
      paramsAt = 0
    }
    return next
  }

  async function current(): Promise<MarketSnapshot | null> {
    const now = Date.now()
    const staleMarket = !market || !onchain || now - marketAt >= marketTtlMs
    if (staleMarket) {
      const next = await refreshMarket(now)
      if (!next || !onchain) return null
    }
    if (!market || !onchain || onchain.status !== 1) return null

    if (!bookParams || now - paramsAt >= bookParamsTtlMs) {
      bookParams = await exchange.client.getBinaryBookParams(onchain.pool)
      paramsAt = now
    }

    if (!book || now - bookAt >= bookTtlMs) {
      book = await exchange.client.getBinaryOrderBook(onchain.pool, { depth: 10, decimals: onchain.decimals })
      bookAt = now
    }

    return {
      market,
      onchain,
      book,
      bookParams,
      prices: snapshotPrices(book, onchain.decimals),
    }
  }

  return { current }
}

function snapshotPrices(book: BinaryOrderBook, decimals: number): BookPrices {
  return {
    yesBid: book.yesBids[0] ? Number(formatUnits(book.yesBids[0].price, decimals)) : undefined,
    noBid: book.noBids[0] ? Number(formatUnits(book.noBids[0].price, decimals)) : undefined,
  }
}
