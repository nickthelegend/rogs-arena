import { isBinaryMarket, SomniaMarkets, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { dashboardExpiredMarketLimit, targetAsset, targetIntervalSeconds } from '@/config'
import type { DashboardMarket, DashboardMarketStatus, Outcome } from '@/types'

export type MarketDiscovery = {
  current: UnifiedMarket | null
  markets: DashboardMarket[]
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

export function isTargetBtcMarket(market: UnifiedMarket, intervalSeconds = targetIntervalSeconds) {
  if (!isBinaryMarket(market.info) || !market.outcomes?.length) return false
  if (binaryMarketIntervalSeconds(market) !== intervalSeconds) return false
  return market.base.toUpperCase().startsWith(`${targetAsset}-`)
}

export function targetMarketStatus(market: UnifiedMarket, nowSeconds: number): DashboardMarketStatus {
  if (!isBinaryMarket(market.info)) return 'inactive'

  const tradingStart = Number(market.info.tradingStart)
  const expiry = Number(market.info.expiry)
  if (!Number.isFinite(tradingStart) || !Number.isFinite(expiry)) return 'inactive'
  if (nowSeconds < tradingStart) return market.active ? 'upcoming' : 'inactive'
  if (nowSeconds >= expiry) return 'expired'
  return market.active ? 'live' : 'inactive'
}

export function isLiveBtcMarket(market: UnifiedMarket, nowSeconds: number, intervalSeconds = targetIntervalSeconds) {
  return isTargetBtcMarket(market, intervalSeconds) && targetMarketStatus(market, nowSeconds) === 'live'
}

export function compareLiveMarkets(left: UnifiedMarket, right: UnifiedMarket) {
  if (!isBinaryMarket(left.info) || !isBinaryMarket(right.info)) return 0

  const expiryDelta = Number(left.info.expiry) - Number(right.info.expiry)
  if (expiryDelta !== 0) return expiryDelta

  const startDelta = Number(right.info.tradingStart) - Number(left.info.tradingStart)
  if (startDelta !== 0) return startDelta

  return left.symbol.localeCompare(right.symbol)
}

function marketWindow(market: UnifiedMarket) {
  if (!isBinaryMarket(market.info)) return { tradingStartSeconds: undefined, expirySeconds: undefined }

  const tradingStartSeconds = Number(market.info.tradingStart)
  const expirySeconds = Number(market.info.expiry)

  return {
    tradingStartSeconds: Number.isFinite(tradingStartSeconds) ? tradingStartSeconds : undefined,
    expirySeconds: Number.isFinite(expirySeconds) ? expirySeconds : undefined,
  }
}

export function toDashboardMarket(market: UnifiedMarket, nowSeconds: number): DashboardMarket {
  const { tradingStartSeconds, expirySeconds } = marketWindow(market)

  return {
    id: market.id,
    symbol: market.symbol,
    status: targetMarketStatus(market, nowSeconds),
    tradingStartSeconds,
    expirySeconds,
  }
}

function statusRank(status: DashboardMarketStatus) {
  if (status === 'live') return 0
  if (status === 'upcoming') return 1
  if (status === 'expired') return 2
  return 3
}

function compareDashboardMarkets(left: DashboardMarket, right: DashboardMarket) {
  const rank = statusRank(left.status) - statusRank(right.status)
  if (rank !== 0) return rank

  if (left.status === 'expired') {
    return (right.expirySeconds ?? 0) - (left.expirySeconds ?? 0)
  }

  const startDelta = (left.tradingStartSeconds ?? 0) - (right.tradingStartSeconds ?? 0)
  if (startDelta !== 0) return startDelta

  return (left.expirySeconds ?? 0) - (right.expirySeconds ?? 0) || left.symbol.localeCompare(right.symbol)
}

export function toDashboardMarkets(markets: UnifiedMarket[], nowSeconds = Math.floor(Date.now() / 1000)) {
  const rows = markets.map((market) => toDashboardMarket(market, nowSeconds)).sort(compareDashboardMarkets)
  const visible: DashboardMarket[] = []
  let expired = 0

  for (const market of rows) {
    if (market.status === 'expired') {
      if (expired >= dashboardExpiredMarketLimit) continue
      expired += 1
    }
    visible.push(market)
  }

  return visible
}

export async function discoverTargetMarkets(
  exchange: SomniaMarkets,
  intervalSeconds = targetIntervalSeconds,
): Promise<MarketDiscovery> {
  const registry = await exchange.loadMarkets(true)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const targets = Object.values(registry).filter((market) => isTargetBtcMarket(market, intervalSeconds))
  const current =
    targets.filter((market) => isLiveBtcMarket(market, nowSeconds, intervalSeconds)).sort(compareLiveMarkets)[0] ?? null

  return {
    current,
    markets: toDashboardMarkets(targets, nowSeconds),
  }
}

export function pickTradable(market: UnifiedMarket, outcome: Outcome) {
  return market.outcomes?.find((item) => item.label === outcome)?.symbol ?? null
}
