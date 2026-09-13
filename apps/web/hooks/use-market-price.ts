'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useSelectedMarket } from '@/hooks/use-market-selection'
import type { PriceFeedStatus } from '@/lib/format'
import type { LivelinePoint } from '@/lib/liveline'
import { marketOracleFeed } from '@/lib/markets'
import { normalizePricePoints } from '@/lib/utils'
import { fetchOraclePrice, subscribeOraclePrice, type OraclePrice } from '@rogs/arena-sdk'
import { useEffect, useMemo, useState } from 'react'

const STALE_REFRESH_MS = 5_000

type MarketPriceState = {
  /** The feed these values were read from; a coin switch ignores the previous feed's state. */
  feed: string | null
  latest: OraclePrice | null
  points: LivelinePoint[]
  status: PriceFeedStatus
  error: string | null
}

const initialState: MarketPriceState = { feed: null, latest: null, points: [], status: 'hydrating', error: null }

/**
 * The selected coin's MagicBlock Pricing Oracle feed (BTC/USD, SOL/USD, ...), read from the feed account on the
 * ephemeral rollup. The chart history starts when the page opens or the coin changes; there is no stored backfill.
 */
export function useMarketPrice() {
  const { connections, oracleFeed } = useArenaChain()
  const { symbol, config, resolved } = useSelectedMarket()
  const feed = useMemo(() => marketOracleFeed(config, oracleFeed), [config, oracleFeed])
  const feedKey = feed.toBase58()
  const [state, setState] = useState<MarketPriceState>(initialState)

  useEffect(() => {
    if (!resolved) return

    let active = true
    let lastUpdateAt = 0
    const own = (current: MarketPriceState) => (current.feed === feedKey ? current : { ...initialState, feed: feedKey })

    const accept = (price: OraclePrice) => {
      if (!active) return
      lastUpdateAt = Date.now()
      setState((previous) => {
        const current = own(previous)
        if (current.latest && price.postedSlot <= current.latest.postedSlot) {
          return current === previous && current.status === 'live' ? previous : { ...current, status: 'live', error: null }
        }
        return {
          feed: feedKey,
          latest: price,
          points: normalizePricePoints([...current.points, { time: price.publishTime, value: price.price }]),
          status: 'live',
          error: null,
        }
      })
    }

    const reject = (error: Error) => {
      if (!active) return
      setState((previous) => ({
        ...own(previous),
        status: 'error',
        error: `MagicBlock ${symbol}/USD oracle: ${error.message}`,
      }))
    }

    const unsubscribe = subscribeOraclePrice(connections.er, accept, reject, feed)
    // If the rollup websocket goes quiet, read the feed account directly instead of showing a frozen price.
    const timer = window.setInterval(() => {
      if (Date.now() - lastUpdateAt < STALE_REFRESH_MS) return
      fetchOraclePrice(connections.er, feed).then(accept, reject)
    }, STALE_REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [connections, feed, feedKey, resolved, symbol])

  const current = state.feed === feedKey ? state : initialState
  return { ...current, symbol, market: config }
}
