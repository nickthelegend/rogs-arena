'use client'

import { getFirebaseDatabase } from '@/lib/firebase'
import { onValue, ref } from 'firebase/database'
import { useEffect, useState } from 'react'

export type MarketTimeseriesPoint = {
  t: number
  yes: number
  no: number
  source?: string | null
  marketId?: string | null
  symbol?: string | null
  expirySeconds?: number | null
}

type TimeseriesStatus = 'loading' | 'live' | 'error'

function isMarketPoint(value: unknown): value is MarketTimeseriesPoint {
  if (!value || typeof value !== 'object') return false

  const point = value as MarketTimeseriesPoint
  return Number.isFinite(point.t) && Number.isFinite(point.yes) && Number.isFinite(point.no)
}

export function useMarketTimeseries(marketIds: string[]) {
  const [points, setPoints] = useState<MarketTimeseriesPoint[]>([])
  const [status, setStatus] = useState<TimeseriesStatus>('loading')
  const filterKey = marketIds.map((id) => id.toLowerCase()).join('|')

  useEffect(() => {
    if (!filterKey) {
      setPoints([])
      setStatus('live')
      return
    }

    const allowed = new Set(filterKey.split('|'))
    const unsubscribe = onValue(
      ref(getFirebaseDatabase(), 'market'),
      (snapshot) => {
        const raw = snapshot.val() as Record<string, unknown> | null
        const next = raw
          ? Object.values(raw).filter(isMarketPoint).filter((point) => {
              const marketId = point.marketId?.toLowerCase()
              return marketId ? allowed.has(marketId) : false
            })
          : []

        next.sort((left, right) => left.t - right.t)
        setPoints(next)
        setStatus('live')
      },
      () => {
        setStatus('error')
      },
    )

    return unsubscribe
  }, [filterKey])

  return { points, status }
}
