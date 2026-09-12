'use client'

import { useCurrentMarket } from '@/hooks/use-current-market'
import { createDreamDexExchange } from '@/lib/dreamdex'
import {
  HISTORY_ASSET,
  HISTORY_INTERVAL_SECONDS,
  HISTORY_MIXED_PAGE_SIZE,
  HISTORY_PAGE_SIZE,
  historyOutcomes,
  type HistoryOutcome,
  type HistorySeries,
} from '@/lib/market-history'
import { isBinaryMarket } from '@somnia-chain/markets-sdk'
import { useEffect, useState } from 'react'

const historyRefreshMs = 15_000
const emptyOutcomes: Record<number, HistoryOutcome> = {}

export function useMarketHistory() {
  const { market } = useCurrentMarket()
  const [outcomes, setOutcomes] = useState<Record<number, HistoryOutcome>>(emptyOutcomes)
  const venueId = market && isBinaryMarket(market.info) ? market.info.venueId : null
  const question = market && isBinaryMarket(market.info) ? market.info.question : null

  useEffect(() => {
    const exchange = createDreamDexExchange()
    const series: HistorySeries = { venueId, question }
    let canceled = false
    let loading = false

    async function load() {
      if (loading) return
      loading = true

      try {
        const past = await exchange.client.listPastBinaryMarkets({
          asset: HISTORY_ASSET,
          intervalSec: HISTORY_INTERVAL_SECONDS,
          ...(venueId ? { venueId } : {}),
          limit: venueId ? HISTORY_PAGE_SIZE : HISTORY_MIXED_PAGE_SIZE,
        })
        if (canceled) return
        setOutcomes(historyOutcomes(past, series))
      } catch {
        // Keep the last resolved tape so a transient indexer miss does not blank the board.
      } finally {
        loading = false
      }
    }

    void load()
    const refreshTimer = window.setInterval(load, historyRefreshMs)

    return () => {
      canceled = true
      window.clearInterval(refreshTimer)
      void exchange.close()
    }
  }, [venueId, question])

  return { outcomes }
}
