'use client'

import { requestRoundData, roundDataStatus, roundIdsFromMarketIds, useArenaRealtime } from '@/lib/arena-realtime'
import { marketCloseFromDto, type MarketClose } from '@/lib/market-closes'
import { useEffect, useMemo } from 'react'

const emptyCloses: MarketClose[] = []

/** Take-profit / stop-loss exits indexed from on-chain sells. `marketIds` are round ids. */
export function useMarketCloses(marketIds: string[]) {
  const filterKey = roundIdsFromMarketIds(marketIds).join('|')
  const roundIds = useMemo(() => (filterKey ? filterKey.split('|').map(Number) : []), [filterKey])
  const byRound = useArenaRealtime((state) => state.closes)
  const loads = useArenaRealtime((state) => state.loads)

  useEffect(() => {
    for (const roundId of roundIds) requestRoundData('closes', roundId)
  }, [loads, roundIds])

  const closes = useMemo(() => {
    if (roundIds.length === 0) return emptyCloses
    const next = roundIds.flatMap((roundId) => (byRound[roundId] ?? []).map(marketCloseFromDto))
    next.sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))
    return next
  }, [byRound, roundIds])

  return {
    closes,
    status: roundDataStatus(loads, 'closes', roundIds),
  }
}
