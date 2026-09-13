'use client'

import { DEFAULT_MARKET, type MarketSymbol } from '@/lib/markets'
import { create } from 'zustand'

type MarketSelectionState = {
  symbol: MarketSymbol
  /** False until the URL and the saved choice have been read in the browser; market loaders wait for it. */
  resolved: boolean
  select: (symbol: MarketSymbol) => void
}

export const useMarketSelectionStore = create<MarketSelectionState>()((set) => ({
  symbol: DEFAULT_MARKET,
  resolved: false,
  select: (symbol) => set({ symbol, resolved: true }),
}))
