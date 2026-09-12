import { isBinaryMarket, type SomniaMarkets, type UnifiedMarket } from '@somnia-chain/markets-sdk'

export const intervalOptions = ['1m', '5m', '15m', '1h'] as const
export type IntervalOption = (typeof intervalOptions)[number]
export const intervalSecondsByLabel = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
} satisfies Record<IntervalOption, number>
export const defaultInterval: IntervalOption = '5m'

export function isIntervalOption(value: string): value is IntervalOption {
  return (intervalOptions as readonly string[]).includes(value)
}

export function binaryMarketIntervalSeconds(market: UnifiedMarket) {
  if (!isBinaryMarket(market.info)) return null

  const intervalSeconds = market.info.intervalSec ? Number(market.info.intervalSec) : Number.NaN
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) return intervalSeconds

  const tradingStart = Number(market.info.tradingStart)
  const expiry = Number(market.info.expiry)
  if (!Number.isFinite(tradingStart) || !Number.isFinite(expiry)) return null

  return expiry - tradingStart
}

export function isLiveBtcMarket(market: UnifiedMarket, nowSeconds: number, intervalSeconds: number) {
  if (!market.active || !isBinaryMarket(market.info) || !market.outcomes?.length) return false
  if (binaryMarketIntervalSeconds(market) !== intervalSeconds) return false
  if (!market.base.toUpperCase().startsWith('BTC-')) return false

  const tradingStart = Number(market.info.tradingStart)
  const expiry = Number(market.info.expiry)
  return Number.isFinite(tradingStart) && Number.isFinite(expiry) && tradingStart <= nowSeconds && nowSeconds < expiry
}

export function compareLiveMarkets(left: UnifiedMarket, right: UnifiedMarket) {
  if (!isBinaryMarket(left.info) || !isBinaryMarket(right.info)) return 0

  const expiryDelta = Number(left.info.expiry) - Number(right.info.expiry)
  if (expiryDelta !== 0) return expiryDelta

  const startDelta = Number(right.info.tradingStart) - Number(left.info.tradingStart)
  if (startDelta !== 0) return startDelta

  return left.symbol.localeCompare(right.symbol)
}

export async function discoverCurrentMarket(exchange: SomniaMarkets, interval: IntervalOption = defaultInterval) {
  const intervalSeconds = intervalSecondsByLabel[interval]
  const registry = await exchange.loadMarkets(true)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const current =
    Object.values(registry)
      .filter((market) => isLiveBtcMarket(market, nowSeconds, intervalSeconds))
      .sort(compareLiveMarkets)[0] ?? null

  return current
}
