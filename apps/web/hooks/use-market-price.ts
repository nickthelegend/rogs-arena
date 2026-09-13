'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useSelectedMarket } from '@/hooks/use-market-selection'
import { getPriceHistory } from '@/lib/arena-api'
import {
  applyOraclePrice,
  applyPriceHistory,
  initialPriceState,
  priceStateFor,
  type MarketPriceState,
} from '@/lib/market-price'
import { marketOracleFeed } from '@/lib/markets'
import { PRICE_HISTORY_SECS } from '@/lib/price-chart'
import { fetchOraclePrice, subscribeOraclePrice, type OraclePrice } from '@rogs/arena-sdk'
import { useEffect, useMemo, useState } from 'react'

const STALE_REFRESH_MS = 5_000

type MarketPriceOptions = {
  /** Seed the points with the arena service's stored samples of the feed; only the chart draws them. */
  history?: boolean
}

/**
 * The selected coin's MagicBlock Pricing Oracle feed (BTC/USD, SOL/USD, ...), read from the feed account on the
 * ephemeral rollup. With `history`, opening the page or switching coins first loads the arena service's stored
 * samples of that feed for the chart's largest window; live reads are appended either way.
 */
export function useMarketPrice({ history = false }: MarketPriceOptions = {}) {
  const { connections, oracleFeed } = useArenaChain()
  const { symbol, config, resolved } = useSelectedMarket()
  const feed = useMemo(() => marketOracleFeed(config, oracleFeed), [config, oracleFeed])
  const feedKey = feed.toBase58()
  const [state, setState] = useState<MarketPriceState>(initialPriceState)

  useEffect(() => {
    if (!resolved) return

    let active = true
    let lastUpdateAt = 0
    const controller = new AbortController()

    const accept = (price: OraclePrice) => {
      if (!active) return
      lastUpdateAt = Date.now()
      setState((previous) => applyOraclePrice(previous, feedKey, price))
    }

    const reject = (error: Error) => {
      if (!active) return
      setState((previous) => ({
        ...priceStateFor(previous, feedKey),
        status: 'error',
        error: `MagicBlock ${symbol}/USD oracle: ${error.message}`,
      }))
    }

    if (history) {
      // The stored samples are a head start only: without them the chart fills from live reads, with no error shown.
      getPriceHistory(symbol, Date.now() - PRICE_HISTORY_SECS * 1000, controller.signal).then(
        (points) => {
          if (active && Array.isArray(points)) setState((previous) => applyPriceHistory(previous, feedKey, points))
        },
        () => undefined,
      )
    }

    const unsubscribe = subscribeOraclePrice(connections.er, accept, reject, feed)
    // If the rollup websocket goes quiet, read the feed account directly instead of showing a frozen price.
    const timer = window.setInterval(() => {
      if (Date.now() - lastUpdateAt < STALE_REFRESH_MS) return
      fetchOraclePrice(connections.er, feed).then(accept, reject)
    }, STALE_REFRESH_MS)

    return () => {
      active = false
      controller.abort()
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [connections, feed, feedKey, history, resolved, symbol])

  const current = state.feed === feedKey ? state : initialPriceState
  return { ...current, symbol, market: config }
}
