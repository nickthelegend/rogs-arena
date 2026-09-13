'use client'

import { currentMarketIds, useCurrentMarket } from '@/hooks/use-current-market'
import { useMarketTimeseries } from '@/hooks/use-market-timeseries'
import { useMarketCloses } from '@/hooks/use-market-closes'
import { useMarketTrades } from '@/hooks/use-market-trades'
import { useTraders } from '@/hooks/use-traders'
import { getRounds } from '@/lib/arena-api'
import {
  advanceLeaderboardHold,
  resolveHeldItems,
  toLeaderboardItems,
  withCloseExits,
  withTraderData,
  type LeaderboardHold,
  type LeaderboardItem,
} from '@/lib/leaderboard'
import { isInMarket, marketSymbolOfRound } from '@/lib/markets'
import { useEffect, useMemo, useState } from 'react'

const emptyHold: LeaderboardHold = { marketKey: '', items: [], epoch: 0 }
const emptyItems: LeaderboardItem[] = []
const RESOLUTION_POLL_MS = 3_000

export function useLeaderboard() {
  const { market, symbol, isLoading: isLoadingMarket } = useCurrentMarket()
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

  const [view, setView] = useState({ hold: emptyHold, frozen: false, symbol })
  // A coin switch starts a fresh board: the other coin's last round is not "the previous round" of this one.
  const base = view.symbol === symbol ? view : { hold: emptyHold, frozen: false, symbol }
  const next = advanceLeaderboardHold(base.hold, marketKey, liveItems)
  if (next.hold !== view.hold || next.frozen !== view.frozen || view.symbol !== symbol) {
    setView({ ...next, symbol })
  }

  // While the previous round's board is held, fetch its outcome so the board shows what positions paid.
  const heldRound = next.frozen ? Number(next.hold.marketKey) : null
  const [resolved, setResolved] = useState<{ roundId: number; outcome: 'YES' | 'NO' } | null>(null)
  useEffect(() => {
    if (heldRound == null || !Number.isInteger(heldRound) || resolved?.roundId === heldRound) return
    const heldMarket = marketSymbolOfRound(heldRound)
    if (!heldMarket) return
    const controller = new AbortController()
    let timer: number | undefined
    const load = async () => {
      try {
        const round = (await getRounds(5, heldMarket, controller.signal)).find(
          (item) => item.roundId === heldRound && isInMarket(item, heldMarket),
        )
        if (round?.outcome === 'YES' || round?.outcome === 'NO') {
          setResolved({ roundId: heldRound, outcome: round.outcome })
          return
        }
      } catch {
        if (controller.signal.aborted) return
        // Transient failure: the held board keeps its last values and the next poll retries.
      }
      timer = window.setTimeout(load, RESOLUTION_POLL_MS)
    }
    void load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [heldRound, resolved?.roundId])

  const heldItems = useMemo(
    () =>
      resolved && heldRound === resolved.roundId ? resolveHeldItems(next.hold.items, resolved.outcome) : next.hold.items,
    [heldRound, next.hold.items, resolved],
  )

  const status = isLoadingMarket || tradesStatus === 'loading' || seriesStatus === 'loading' || closesStatus === 'loading'
    ? 'loading'
    : tradesStatus === 'error' || seriesStatus === 'error' || closesStatus === 'error'
      ? 'error'
      : 'live'

  const items = useMemo(() => withTraderData(heldItems, traders, now), [heldItems, now, traders])

  return { items, epoch: next.hold.epoch, frozen: next.frozen, status }
}
