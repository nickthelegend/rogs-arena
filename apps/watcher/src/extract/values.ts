import { isBinaryMarket, SomniaMarkets, type LiveFill, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { defaultQuoteDecimals, marketFillLimit } from '@/config'
import { bigintToProbability, rawToProbability } from '@/lib/units'
import type { MarketValueSource } from '@/types'

export type MarketValue = {
  yesValue: number
  noValue: number
  source: MarketValueSource
  bookYes?: number
  lastFillYes?: number
  fallbackYes?: number
  fillCount: number
  fills: LiveFill[]
}

function fillSortValue(fill: LiveFill) {
  return fill.blockNumber * 1_000_000 + fill.logIndex
}

export function marketValues(exchange: SomniaMarkets, market: UnifiedMarket): MarketValue | null {
  if (!isBinaryMarket(market.info)) return null

  const decimals = market.info.quoteDecimals ?? defaultQuoteDecimals
  const marketId = market.info.marketId.toLowerCase()
  const liveMarket = exchange.client.getLiveMarketByPool(market.info.poolAddress)
  const binaryMarket = liveMarket && isBinaryMarket(liveMarket) ? liveMarket : market.info
  const book = exchange.client.getLiveBinaryOrderBook(market.info.poolAddress, {
    depth: 5,
  })
  const fills = exchange.client
    .getLiveFills(market.info.poolAddress, { limit: marketFillLimit })
    .filter((fill) => fill.market_id.toLowerCase() === marketId)
    .sort((left, right) => fillSortValue(left) - fillSortValue(right))

  const fallbackYes = rawToProbability(binaryMarket.lastPrice, decimals)
  const bookBid = bigintToProbability(book.yesBids[0]?.price, decimals)
  const bookAsk = bigintToProbability(book.yesAsks[0]?.price, decimals)
  const bookYes = bookBid !== undefined && bookAsk !== undefined ? (bookBid + bookAsk) / 2 : (bookBid ?? bookAsk)
  const lastFillYes = rawToProbability(fills.at(-1)?.fillPrice, decimals)
  const yesValue = bookYes ?? lastFillYes ?? fallbackYes ?? 0.5
  const source: MarketValueSource =
    bookYes !== undefined
      ? 'book'
      : lastFillYes !== undefined
        ? 'fill'
        : fallbackYes !== undefined
          ? 'last_price'
          : 'default'

  return {
    yesValue,
    noValue: 1 - yesValue,
    source,
    bookYes,
    lastFillYes,
    fallbackYes,
    fillCount: fills.length,
    fills,
  }
}
