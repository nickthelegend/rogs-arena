'use client'

import { currentMarketIds, useCurrentMarket } from '@/hooks/use-current-market'
import { useMarketTimeseries } from '@/hooks/use-market-timeseries'
import { useMarketCloses } from '@/hooks/use-market-closes'
import { useMarketTrades } from '@/hooks/use-market-trades'
import { useTraders } from '@/hooks/use-traders'
import {
  advanceLeaderboardHold,
  toLeaderboardItems,
  withCloseExits,
  withTraderData,
  type LeaderboardHold,
  type LeaderboardItem,
} from '@/lib/leaderboard'
import { useMemo, useState } from 'react'

const emptyHold: LeaderboardHold = { marketKey: '', items: [], epoch: 0 }
const emptyItems: LeaderboardItem[] = []

export function useLeaderboard() {
  const { market, isLoading: isLoadingMarket } = useCurrentMarket()
  const marketIds = useMemo(() => currentMarketIds(market), [market])
  const marketKey = marketIds.join('|')
  const { trades, status: tradesStatus } = useMarketTrades(marketIds)
  const { closes, status: closesStatus } = useMarketCloses(marketIds)
  const { points, status: seriesStatus } = useMarketTimeseries(marketIds)
  const { traders, now } = useTraders()
  const latest = points.at(-1)
  const yes = latest?.yes
  const no = latest?.no ?? (yes == null ? undefined : 1 - yes)
  const liveItems = useMemo(
    () => (marketKey ? withCloseExits(toLeaderboardItems(trades, { yes, no }), closes) : emptyItems),
    [closes, marketKey, no, trades, yes],
  )

  const [view, setView] = useState({ hold: emptyHold, frozen: false })
  const next = advanceLeaderboardHold(view.hold, marketKey, liveItems)
  if (next.hold !== view.hold || next.frozen !== view.frozen) {
    setView(next)
  }

  const status = isLoadingMarket || tradesStatus === 'loading' || seriesStatus === 'loading' || closesStatus === 'loading'
    ? 'loading'
    : tradesStatus === 'error' || seriesStatus === 'error' || closesStatus === 'error'
      ? 'error'
      : 'live'

  const items = useMemo(() => withTraderData(next.hold.items, traders, now), [next.hold.items, now, traders])

  return { items, epoch: next.hold.epoch, frozen: next.frozen, status }
}
