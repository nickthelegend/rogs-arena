'use client'

import type { PointDto } from '@/lib/arena-api'
import { requestRoundData, roundDataStatus, roundIdsFromMarketIds, useArenaRealtime } from '@/lib/arena-realtime'
import { useEffect, useMemo } from 'react'

export type MarketTimeseriesPoint = {
  t: number
  yes: number
  no: number
  source?: string | null
  marketId?: string | null
  symbol?: string | null
  expirySeconds?: number | null
}

const emptyPoints: MarketTimeseriesPoint[] = []

function pointFromDto(point: PointDto): MarketTimeseriesPoint {
  return {
    t: point.t,
    yes: point.yes,
    no: point.no,
    source: point.source,
    marketId: String(point.roundId),
    symbol: null,
    expirySeconds: null,
  }
}

/** YES/NO prices sampled from the on-chain Arena account, per round. `marketIds` are round ids. */
export function useMarketTimeseries(marketIds: string[]) {
  const filterKey = roundIdsFromMarketIds(marketIds).join('|')
  const roundIds = useMemo(() => (filterKey ? filterKey.split('|').map(Number) : []), [filterKey])
  const byRound = useArenaRealtime((state) => state.points)
  const loads = useArenaRealtime((state) => state.loads)

  useEffect(() => {
    for (const roundId of roundIds) requestRoundData('points', roundId)
  }, [loads, roundIds])

  const points = useMemo(() => {
    if (roundIds.length === 0) return emptyPoints
    const next = roundIds.flatMap((roundId) => (byRound[roundId] ?? []).map(pointFromDto))
    next.sort((left, right) => left.t - right.t)
    return next
  }, [byRound, roundIds])

  return { points, status: roundDataStatus(loads, 'points', roundIds) }
}
