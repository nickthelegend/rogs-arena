'use client'

import { useSelectedMarket } from '@/hooks/use-market-selection'
import { arenaRealtime } from '@/lib/arena-realtime'
import { useEffect, type ReactNode } from 'react'

export function ArenaRealtimeProvider({ children }: { children: ReactNode }) {
  const { symbol, resolved } = useSelectedMarket()

  // Declared before `retain` so the first socket and snapshot already carry the selected coin.
  useEffect(() => {
    if (resolved) arenaRealtime().setMarket(symbol)
  }, [resolved, symbol])

  useEffect(() => arenaRealtime().retain(), [])

  return children
}
