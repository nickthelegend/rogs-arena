import { isBinaryMarket, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { dashboardFillLimit, defaultQuoteDecimals } from '@/config'
import { pickTradable } from '@/extract/discovery'
import type { MarketValue } from '@/extract/values'
import type { DashboardFill, MarketTrade, WatcherSnapshot } from '@/types'
import { toMarketTrades } from './trade'

export function toDashboardFills(trades: MarketTrade[]): DashboardFill[] {
  return trades
    .slice(-dashboardFillLimit)
    .reverse()
    .map((trade) => ({
      id: trade.id,
      timestamp: trade.t ?? undefined,
      side: trade.side ?? undefined,
      kind: trade.kind ?? undefined,
      price: trade.price ?? undefined,
      amount: trade.amount ?? undefined,
      cost: trade.cost ?? undefined,
    }))
}

export function marketMeta(market: UnifiedMarket) {
  const expirySeconds = isBinaryMarket(market.info) ? Number(market.info.expiry) : undefined
  const tradingStartSeconds = isBinaryMarket(market.info) ? Number(market.info.tradingStart) : undefined

  return {
    marketSymbol: market.symbol,
    marketId: market.id,
    yesSymbol: pickTradable(market, 'YES') ?? undefined,
    noSymbol: pickTradable(market, 'NO') ?? undefined,
    expirySeconds: Number.isFinite(expirySeconds) ? expirySeconds : undefined,
    tradingStartSeconds: Number.isFinite(tradingStartSeconds) ? tradingStartSeconds : undefined,
  }
}

export function snapshotFromValue(market: UnifiedMarket, value: MarketValue): WatcherSnapshot {
  const decimals = isBinaryMarket(market.info)
    ? (market.info.quoteDecimals ?? defaultQuoteDecimals)
    : defaultQuoteDecimals
  const baseDecimals = isBinaryMarket(market.info) ? market.info.baseDecimals : defaultQuoteDecimals
  const trades = toMarketTrades(value.fills, decimals, baseDecimals, market.id, market.symbol)

  return {
    phase: 'watching',
    ...marketMeta(market),
    yes: value.yesValue,
    no: value.noValue,
    source: value.source,
    bookYes: value.bookYes,
    lastFillYes: value.lastFillYes,
    fallbackYes: value.fallbackYes,
    fillCount: value.fillCount,
    fills: toDashboardFills(trades),
    trades,
    updatedAt: Date.now(),
  }
}

export function switchingSnapshot(previous: UnifiedMarket | undefined, message: string): WatcherSnapshot {
  return {
    phase: 'connecting',
    message,
    ...(previous ? marketMeta(previous) : {}),
    fillCount: 0,
    fills: [],
    trades: [],
    updatedAt: Date.now(),
  }
}
