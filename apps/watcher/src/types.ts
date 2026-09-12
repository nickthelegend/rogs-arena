import type { UnifiedMarket } from '@somnia-chain/markets-sdk'

export type Outcome = 'YES' | 'NO'
export type MarketValueSource = 'book' | 'fill' | 'last_price' | 'default'
export type WatcherPhase = 'connecting' | 'waiting' | 'watching' | 'error'
export type DashboardMarketStatus = 'live' | 'upcoming' | 'expired' | 'inactive'

export type DashboardMarket = {
  id: string
  symbol: string
  status: DashboardMarketStatus
  tradingStartSeconds?: number
  expirySeconds?: number
}

export type WatchResult =
  | { event: 'market_expired' }
  | { event: 'market_changed'; market: UnifiedMarket }
  | { event: 'market_unavailable' }

export type DashboardFill = {
  id: string
  timestamp?: number
  side?: string
  kind?: string
  price?: number
  amount?: number
  cost?: number
}

export type MarketTrade = {
  id: string
  t: number | null
  marketId: string | null
  symbol: string | null
  side: string | null
  kind: string | null
  outcome: Outcome | null
  price: number | null
  amount: number | null
  cost: number | null
  taker: string | null
}

export type WatcherSnapshot = {
  phase: WatcherPhase
  message?: string
  retryAt?: number
  marketSymbol?: string
  marketId?: string
  yesSymbol?: string
  noSymbol?: string
  expirySeconds?: number
  tradingStartSeconds?: number
  yes?: number
  no?: number
  source?: MarketValueSource
  bookYes?: number
  lastFillYes?: number
  fallbackYes?: number
  fillCount: number
  fills: DashboardFill[]
  trades: MarketTrade[]
  markets?: DashboardMarket[]
  updatedAt?: number
}

export type SnapshotListener = (snapshot: WatcherSnapshot) => void

export type MarketPoint = {
  t: number
  yes: number
  no: number
  source: MarketValueSource | null
  marketId: string | null
  symbol: string | null
  expirySeconds: number | null
}
