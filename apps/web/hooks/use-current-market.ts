'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { errorMessage } from '@/lib/error'
import { fetchArena, subscribeArena, toArenaMarket, type ArenaMarket, type ArenaState } from '@rogs/arena-sdk'
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type { ArenaMarket }

type CurrentMarketState = {
  market: ArenaMarket | null
  arena: ArenaState | null
  isLoading: boolean
  error: string | null
}

const CurrentMarketContext = createContext<CurrentMarketState | null>(null)

const arenaRefreshMs = 10_000
export const TARGET_MARKET_INTERVAL_SECONDS = 5 * 60

function marketExpirySeconds(market: ArenaMarket | null) {
  if (!market) return undefined
  const expiry = market.info.expiry
  return Number.isFinite(expiry) ? expiry : undefined
}

/** A round's market id is its round id as a decimal string. */
export function currentMarketIds(market: ArenaMarket | null) {
  if (!market) return []
  return [...new Set([market.id, market.info.marketId])]
}

export function marketWindowSeconds(market: ArenaMarket | null, fallback = TARGET_MARKET_INTERVAL_SECONDS) {
  if (!market) return fallback

  const intervalSeconds = market.info.intervalSec
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) return intervalSeconds

  const { tradingStart, expiry } = market.info
  if (!Number.isFinite(tradingStart) || !Number.isFinite(expiry)) return fallback

  return Math.max(60, expiry - tradingStart)
}

/** Never lets a slower read replace a newer Arena state (a later round, or more trades in the same round). */
function newerArena(current: ArenaState | null, next: ArenaState) {
  if (!current) return next
  if (next.current.id !== current.current.id) return next.current.id > current.current.id ? next : current
  if (next.current.trades < current.current.trades) return current
  return next
}

function useCurrentMarketLoader(): CurrentMarketState {
  const { connections, programId } = useArenaChain()
  const [arena, setArena] = useState<ArenaState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [expiryTick, setExpiryTick] = useState(0)

  useEffect(() => {
    let active = true
    const accept = (next: ArenaState) => {
      if (!active) return
      setArena((current) => newerArena(current, next))
      setError(null)
      setLoaded(true)
    }
    const reject = (cause: unknown) => {
      if (!active) return
      setError(errorMessage(cause))
      setLoaded(true)
    }

    const unsubscribe = subscribeArena(connections.er, accept, reject, programId)
    // The rollup account subscription carries trades and rolls; this read covers a dropped websocket
    // and retries while the arena account is missing.
    const timer = window.setInterval(() => {
      fetchArena(connections.er, programId).then(accept, reject)
    }, arenaRefreshMs)

    return () => {
      active = false
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [connections, programId])

  const endTs = arena?.current.endTs ?? null
  useEffect(() => {
    if (endTs == null) return
    const delay = endTs * 1000 - Date.now()
    if (delay <= 0) return
    const timer = window.setTimeout(() => setExpiryTick((tick) => tick + 1), Math.min(delay + 50, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [endTs])

  const market = useMemo(
    () => (arena ? toArenaMarket(arena, Math.floor(Date.now() / 1000)) : null),
    // expiryTick recomputes `active` when the round's end time passes without an account change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arena, expiryTick],
  )

  return { market, arena, isLoading: !loaded, error }
}

export function CurrentMarketProvider({ children }: { children: ReactNode }) {
  const value = useCurrentMarketLoader()
  return createElement(CurrentMarketContext.Provider, { value }, children)
}

export function useCurrentMarket() {
  const context = useContext(CurrentMarketContext)
  if (!context) {
    throw new Error('useCurrentMarket must be used within CurrentMarketProvider')
  }
  return context
}

export function useMarketCountdown() {
  const { market, isLoading } = useCurrentMarket()
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    tick()

    const timer = window.setInterval(tick, 1_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (isLoading || nowMs == null) return null

  const expiry = marketExpirySeconds(market)
  if (expiry === undefined) return null

  return Math.max(0, Math.ceil((expiry * 1000 - nowMs) / 1000))
}
