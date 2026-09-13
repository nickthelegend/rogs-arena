'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import type { PriceFeedStatus } from '@/lib/format'
import type { LivelinePoint } from '@/lib/liveline'
import { normalizePricePoints } from '@/lib/utils'
import { fetchOraclePrice, subscribeOraclePrice, type OraclePrice } from '@rogs/arena-sdk'
import { useEffect, useState } from 'react'

const STALE_REFRESH_MS = 5_000

type BtcPriceState = {
  latest: OraclePrice | null
  points: LivelinePoint[]
  status: PriceFeedStatus
  error: string | null
}

const initialState: BtcPriceState = { latest: null, points: [], status: 'hydrating', error: null }

/**
 * MagicBlock Pricing Oracle BTC/USD, read from the feed account on the ephemeral rollup.
 * The chart history starts when the page opens; there is no stored backfill.
 */
export function useBtcPrice() {
  const { connections, oracleFeed } = useArenaChain()
  const [state, setState] = useState<BtcPriceState>(initialState)

  useEffect(() => {
    let active = true
    let lastUpdateAt = 0

    const accept = (price: OraclePrice) => {
      if (!active) return
      lastUpdateAt = Date.now()
      setState((current) => {
        if (current.latest && price.postedSlot <= current.latest.postedSlot) {
          return current.status === 'live' ? current : { ...current, status: 'live', error: null }
        }
        return {
          latest: price,
          points: normalizePricePoints([...current.points, { time: price.publishTime, value: price.price }]),
          status: 'live',
          error: null,
        }
      })
    }

    const reject = (error: Error) => {
      if (!active) return
      setState((current) => ({ ...current, status: 'error', error: `MagicBlock BTC/USD oracle: ${error.message}` }))
    }

    const unsubscribe = subscribeOraclePrice(connections.er, accept, reject, oracleFeed)
    // If the rollup websocket goes quiet, read the feed account directly instead of showing a frozen price.
    const timer = window.setInterval(() => {
      if (Date.now() - lastUpdateAt < STALE_REFRESH_MS) return
      fetchOraclePrice(connections.er, oracleFeed).then(accept, reject)
    }, STALE_REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [connections, oracleFeed])

  return state
}
