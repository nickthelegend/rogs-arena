'use client'

import { getFirebaseDatabase } from '@/lib/firebase'
import { CLOSES_PATH, isMarketClose, type MarketClose } from '@/lib/market-closes'
import { onValue, ref } from 'firebase/database'
import { useEffect, useState } from 'react'

type ClosesStatus = 'loading' | 'live' | 'error'

const emptyCloses: MarketClose[] = []

export function useMarketCloses(marketIds: string[]) {
  const [closes, setCloses] = useState<MarketClose[]>([])
  const [status, setStatus] = useState<ClosesStatus>('loading')
  const filterKey = marketIds.map((id) => id.toLowerCase()).join('|')

  useEffect(() => {
    if (!filterKey) return

    const allowed = new Set(filterKey.split('|'))
    const unsubscribe = onValue(
      ref(getFirebaseDatabase(), CLOSES_PATH),
      (snapshot) => {
        const raw = snapshot.val() as Record<string, unknown> | null
        const next = raw
          ? Object.entries(raw).flatMap(([id, value]) => {
              if (!isMarketClose(id, value)) return []
              const marketId = value.marketId.toLowerCase()
              if (!allowed.has(marketId)) return []
              return [{ id, ...value, trader: value.trader.toLowerCase() }]
            })
          : []

        next.sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))
        setCloses(next)
        setStatus('live')
      },
      () => {
        setStatus('error')
      },
    )

    return unsubscribe
  }, [filterKey])

  return {
    closes: filterKey ? closes : emptyCloses,
    status: filterKey ? status : 'live',
  }
}
