'use client'

import { requestRoundData, roundDataStatus, roundIdsFromMarketIds, useArenaRealtime } from '@/lib/arena-realtime'
import { marketTradeFromDto, type MarketTrade } from '@/lib/market-trades'
import { useEffect, useMemo } from 'react'

const emptyTrades: MarketTrade[] = []

/** `marketIds` are round ids as decimal strings (the arena market id). */
export function useMarketTrades(marketIds: string[]) {
  const filterKey = roundIdsFromMarketIds(marketIds).join('|')
  const roundIds = useMemo(() => (filterKey ? filterKey.split('|').map(Number) : []), [filterKey])
  const byRound = useArenaRealtime((state) => state.trades)
  const loads = useArenaRealtime((state) => state.loads)

  useEffect(() => {
    for (const roundId of roundIds) requestRoundData('trades', roundId)
  }, [loads, roundIds])

  const trades = useMemo(() => {
    if (roundIds.length === 0) return emptyTrades
    const next = roundIds.flatMap((roundId) => (byRound[roundId] ?? []).map(marketTradeFromDto))
    next.sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))
    return next
  }, [byRound, roundIds])

  return {
    trades,
    status: roundDataStatus(loads, 'trades', roundIds),
  }
}
