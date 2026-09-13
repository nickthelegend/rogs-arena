'use client'

import { getRounds } from '@/lib/arena-api'
import { errorMessage } from '@/lib/error'
import { HISTORY_PAGE_SIZE, historyOutcomes, type HistoryOutcome } from '@/lib/market-history'
import { useEffect, useState } from 'react'

const historyRefreshMs = 15_000
const emptyOutcomes: Record<number, HistoryOutcome> = {}

export function useMarketHistory() {
  const [outcomes, setOutcomes] = useState<Record<number, HistoryOutcome>>(emptyOutcomes)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let loading = false

    async function load() {
      if (loading) return
      loading = true

      try {
        const rounds = await getRounds(HISTORY_PAGE_SIZE, controller.signal)
        if (controller.signal.aborted) return
        setOutcomes(historyOutcomes(rounds))
        setError(null)
      } catch (cause) {
        if (controller.signal.aborted) return
        // Resolved rounds already on the board stay; the failure is reported alongside them.
        setError(`Could not load round history: ${errorMessage(cause)}`)
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
  }, [])

  return { outcomes, error }
}
