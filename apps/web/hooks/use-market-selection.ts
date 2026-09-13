'use client'

import {
  marketConfig,
  readStoredMarket,
  resolveMarketSelection,
  urlWithMarket,
  writeStoredMarket,
} from '@/lib/markets'
import { useMarketSelectionStore } from '@/stores/market'
import { useEffect, useLayoutEffect, useMemo } from 'react'

const browserStorage = () => window.localStorage

/** The coin picked in the header island. `resolved` turns true once the URL and saved choice were read. */
export function useSelectedMarket() {
  const symbol = useMarketSelectionStore((state) => state.symbol)
  const resolved = useMarketSelectionStore((state) => state.resolved)
  const select = useMarketSelectionStore((state) => state.select)
  const config = useMemo(() => marketConfig(symbol), [symbol])
  return { symbol, config, resolved, select }
}

/**
 * Reads `?market=` (then the `rogs.market` choice, then BTC) in a layout effect, so it lands before any market
 * loader's effect runs, and mirrors the selection back into localStorage and the arena page's URL.
 * The server render always starts unresolved, which keeps hydration identical for every coin.
 */
export function MarketSelectionSync() {
  const symbol = useMarketSelectionStore((state) => state.symbol)
  const resolved = useMarketSelectionStore((state) => state.resolved)

  useLayoutEffect(() => {
    const read = () => {
      const selection = resolveMarketSelection({
        search: window.location.search,
        stored: readStoredMarket(browserStorage),
      })
      useMarketSelectionStore.getState().select(selection.symbol)
    }
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])

  useEffect(() => {
    if (!resolved) return
    writeStoredMarket(browserStorage, symbol)
    // Only the arena board is market-scoped; /proof shows every market and keeps a clean URL.
    if (window.location.pathname !== '/') return
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const next = urlWithMarket(window.location.href, symbol)
    if (next !== current) window.history.replaceState(null, '', next)
  }, [resolved, symbol])

  return null
}
