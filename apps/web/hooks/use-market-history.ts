'use client'

import { useSelectedMarket } from '@/hooks/use-market-selection'
import { getRounds } from '@/lib/arena-api'
import { errorMessage } from '@/lib/error'
import { HISTORY_PAGE_SIZE, historyOutcomes, type HistoryOutcome } from '@/lib/market-history'
import { isInMarket, type MarketSymbol } from '@/lib/markets'
import { useEffect, useState } from 'react'

const historyRefreshMs = 15_000
const emptyOutcomes: Record<number, HistoryOutcome> = {}

type HistoryView = { symbol: MarketSymbol | null; outcomes: Record<number, HistoryOutcome>; error: string | null }

export function useMarketHistory() {
  const { symbol, resolved } = useSelectedMarket()
  const [view, setView] = useState<HistoryView>({ symbol: null, outcomes: emptyOutcomes, error: null })

  useEffect(() => {
    if (!resolved) return

    const controller = new AbortController()
    let loading = false

    async function load() {
      if (loading) return
      loading = true

      try {
        const rounds = await getRounds(HISTORY_PAGE_SIZE, symbol, controller.signal)
        if (controller.signal.aborted) return
        // A service without market support answers every coin with BTC rounds; those stay off other coins' boards.
        setView({ symbol, outcomes: historyOutcomes(rounds.filter((round) => isInMarket(round, symbol))), error: null })
      } catch (cause) {
        if (controller.signal.aborted) return
        // Resolved rounds already on the board stay; the failure is reported alongside them.
        setView((current) => ({
          symbol,
          outcomes: current.symbol === symbol ? current.outcomes : emptyOutcomes,
          error: `Could not load ${symbol} round history: ${errorMessage(cause)}`,
        }))
      } finally {
        loading = false
      }
    }

    void load()
    const refreshTimer = window.setInterval(load, historyRefreshMs)

    return () => {
      controller.abort()
      window.clearInterval(refreshTimer)
    }
  }, [resolved, symbol])

  const current = view.symbol === symbol ? view : null
  return { outcomes: current?.outcomes ?? emptyOutcomes, error: current?.error ?? null }
}
