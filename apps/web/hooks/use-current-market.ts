'use client'

import { createDreamDexExchange } from '@/lib/dreamdex'
import { isBinaryMarket, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type CurrentMarketState = {
  market: UnifiedMarket | null
  isLoading: boolean
}

const CurrentMarketContext = createContext<CurrentMarketState | null>(null)

const liveMarketRefreshMs = 5_000
export const TARGET_MARKET_INTERVAL_SECONDS = 5 * 60

function binaryMarketIntervalSeconds(market: UnifiedMarket) {
  if (!isBinaryMarket(market.info)) return null

  const intervalSeconds = market.info.intervalSec ? Number(market.info.intervalSec) : Number.NaN
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) return intervalSeconds

  const tradingStart = Number(market.info.tradingStart)
  const expiry = Number(market.info.expiry)
  if (!Number.isFinite(tradingStart) || !Number.isFinite(expiry)) return null

  return expiry - tradingStart
}

function isLiveTargetMarket(market: UnifiedMarket, nowSeconds: number) {
  if (!market.active || !isBinaryMarket(market.info) || !market.outcomes?.length) return false
  if (binaryMarketIntervalSeconds(market) !== TARGET_MARKET_INTERVAL_SECONDS) return false

  const tradingStart = Number(market.info.tradingStart)
  const expiry = Number(market.info.expiry)

  return Number.isFinite(tradingStart) && Number.isFinite(expiry) && tradingStart <= nowSeconds && nowSeconds < expiry
}

function compareLiveMarkets(left: UnifiedMarket, right: UnifiedMarket) {
  if (!isBinaryMarket(left.info) || !isBinaryMarket(right.info)) return 0

  const expiryDelta = Number(left.info.expiry) - Number(right.info.expiry)
  if (expiryDelta !== 0) return expiryDelta

  const startDelta = Number(right.info.tradingStart) - Number(left.info.tradingStart)
  if (startDelta !== 0) return startDelta

  return left.symbol.localeCompare(right.symbol)
}

function marketExpirySeconds(market: UnifiedMarket | null) {
  if (!market || !isBinaryMarket(market.info)) return undefined

  const expiry = Number(market.info.expiry)
  return Number.isFinite(expiry) ? expiry : undefined
}

export function currentMarketIds(market: UnifiedMarket | null) {
  if (!market) return []

  const ids = [market.id]
  if (isBinaryMarket(market.info)) ids.push(market.info.marketId)
  return [...new Set(ids.map((id) => id.toLowerCase()))]
}

export function marketWindowSeconds(market: UnifiedMarket | null, fallback = TARGET_MARKET_INTERVAL_SECONDS) {
  if (!market || !isBinaryMarket(market.info)) return fallback

  const intervalSeconds = market.info.intervalSec ? Number(market.info.intervalSec) : Number.NaN
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) return intervalSeconds

  const tradingStart = Number(market.info.tradingStart)
  const expiry = Number(market.info.expiry)
  if (!Number.isFinite(tradingStart) || !Number.isFinite(expiry)) return fallback

  return Math.max(60, expiry - tradingStart)
}

function useCurrentMarketLoader() {
  const exchange = useMemo(() => createDreamDexExchange(), [])
  const [market, setMarket] = useState<UnifiedMarket | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    return () => {
      void exchange.close()
    }
  }, [exchange])

  useEffect(() => {
    let canceled = false
    let loading = false

    async function loadMarkets() {
      if (loading) return
      loading = true

      try {
        const registry = await exchange.loadMarkets(true)
        const now = Math.floor(Date.now() / 1000)
        const binaryMarkets = Object.values(registry)
          .filter((item) => isLiveTargetMarket(item, now))
          .sort(compareLiveMarkets)

        if (canceled) return

        setMarket((current) => {
          if (current && binaryMarkets.some((item) => item.symbol === current.symbol)) {
            return binaryMarkets.find((item) => item.symbol === current.symbol) ?? binaryMarkets[0] ?? null
          }

          return binaryMarkets[0] ?? null
        })
      } catch {
        if (!canceled) setMarket(null)
      } finally {
        loading = false
        if (!canceled) setIsLoading(false)
      }
    }

    void loadMarkets()
    const refreshTimer = window.setInterval(loadMarkets, liveMarketRefreshMs)

    return () => {
      canceled = true
      window.clearInterval(refreshTimer)
    }
  }, [exchange])

  return { market, isLoading }
}

export function CurrentMarketProvider({ children }: { children: ReactNode }) {
  const value = useCurrentMarketLoader()
  return createElement(CurrentMarketContext.Provider, { value }, children)
}

export function useCurrentMarket() {
  const context = useContext(CurrentMarketContext)
  if (!context) {
    throw new Error('useCurrentMarket must be used within CurrentMarketProvider')
  }
  return context
}

export function useMarketCountdown() {
  const { market, isLoading } = useCurrentMarket()
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    tick()

    const timer = window.setInterval(tick, 1_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (isLoading || nowMs == null) return null

  const expiry = marketExpirySeconds(market)
  if (expiry === undefined) return null

  return Math.max(0, Math.ceil((expiry * 1000 - nowMs) / 1000))
}
