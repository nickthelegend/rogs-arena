'use client'

import { getFirebaseDatabase } from '@/lib/firebase'
import { isMarketTrade, type MarketTrade } from '@/lib/market-trades'
import { onValue, ref } from 'firebase/database'
import { useEffect, useState } from 'react'

type TradesStatus = 'loading' | 'live' | 'error'

const emptyTrades: MarketTrade[] = []

export function useMarketTrades(marketIds: string[]) {
  const [trades, setTrades] = useState<MarketTrade[]>([])
  const [status, setStatus] = useState<TradesStatus>('loading')
  const filterKey = marketIds.map((id) => id.toLowerCase()).join('|')

  useEffect(() => {
    if (!filterKey) return

    const allowed = new Set(filterKey.split('|'))
    const unsubscribe = onValue(
      ref(getFirebaseDatabase(), 'trades'),
      (snapshot) => {
        const raw = snapshot.val() as Record<string, unknown> | null
        const next = raw
          ? Object.entries(raw).flatMap(([id, value]) => {
              if (!isMarketTrade(id, value)) return []
              const marketId = value.marketId?.toLowerCase()
              if (!marketId || !allowed.has(marketId)) return []
              return [{ id, ...value }]
            })
          : []

        next.sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))
        setTrades(next)
        setStatus('live')
      },
      () => {
        setStatus('error')
      },
    )

    return unsubscribe
  }, [filterKey])

  return {
    trades: filterKey ? trades : emptyTrades,
    status: filterKey ? status : 'live',
  }
}
