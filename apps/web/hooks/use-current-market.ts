'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useSelectedMarket } from '@/hooks/use-market-selection'
import { errorMessage } from '@/lib/error'
import { marketUnavailableReason, type MarketSymbol } from '@/lib/markets'
import {
  arenaPda,
  decodeArena,
  toArenaMarket,
  type ArenaMarket,
  type ArenaState,
  type MarketConfig,
} from '@rogs/arena-sdk'
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type { ArenaMarket }

type CurrentMarketState = {
  /** The coin picked in the header island. */
  symbol: MarketSymbol
  selected: MarketConfig
  market: ArenaMarket | null
  arena: ArenaState | null
  /** null until the first rollup read; false while the coin's arena account does not exist on the ER. */
  available: boolean | null
  isLoading: boolean
  error: string | null
}

type ArenaView = {
  symbol: MarketSymbol | null
  arena: ArenaState | null
  available: boolean | null
  error: string | null
  loaded: boolean
  /** Wall-clock unix seconds when `arena` was read. */
  readAt: number
}

const CurrentMarketContext = createContext<CurrentMarketState | null>(null)

const arenaRefreshMs = 10_000
const emptyView: ArenaView = { symbol: null, arena: null, available: null, error: null, loaded: false, readAt: 0 }
export const TARGET_MARKET_INTERVAL_SECONDS = 5 * 60

function marketExpirySeconds(market: ArenaMarket | null) {
  if (!market) return undefined
  const expiry = market.info.expiry
  return Number.isFinite(expiry) ? expiry : undefined
}

/** A round's market id is its (namespaced) round id as a decimal string. */
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
  if (!current || current.market !== next.market) return next
  if (next.current.id !== current.current.id) return next.current.id > current.current.id ? next : current
  if (next.current.trades < current.current.trades) return current
  return next
}

function useCurrentMarketLoader(): CurrentMarketState {
  const { connections, programId } = useArenaChain()
  const { symbol, config: selected, resolved } = useSelectedMarket()
  const [view, setView] = useState<ArenaView>(emptyView)
  const [endedAt, setEndedAt] = useState(0)

  useEffect(() => {
    if (!resolved) return

    let active = true
    const address = arenaPda(programId, selected.id)
    const own = (current: ArenaView): ArenaView => (current.symbol === symbol ? current : { ...emptyView, symbol })
    const accept = (next: ArenaState) => {
      if (!active) return
      const readAt = Math.floor(Date.now() / 1000)
      setView((current) => {
        const previous = own(current)
        const arena = newerArena(previous.arena, next)
        return {
          symbol,
          arena,
          available: true,
          error: null,
          loaded: true,
          readAt: arena === previous.arena ? previous.readAt : readAt,
        }
      })
    }
    const missing = () => {
      if (!active) return
      const readAt = Math.floor(Date.now() / 1000)
      setView({ symbol, arena: null, available: false, error: marketUnavailableReason(symbol), loaded: true, readAt })
    }
    const reject = (cause: unknown) => {
      if (!active) return
      setView((current) => ({ ...own(current), error: errorMessage(cause), loaded: true }))
    }
    const read = () => {
      connections.er
        .getAccountInfo(address, 'confirmed')
        .then((account) => {
          if (!account) missing()
          else accept(decodeArena(address, account.data))
        })
        .catch(reject)
    }

    read()
    // The rollup account subscription carries trades and rolls; the poll covers a dropped websocket and notices a
    // coin's arena account appearing once that market is bootstrapped and delegated.
    const subscription = connections.er.onAccountChange(
      address,
      (account) => {
        if (!active) return
        try {
          accept(decodeArena(address, account.data))
        } catch (cause) {
          reject(cause)
        }
      },
      { commitment: 'confirmed' },
    )
    const timer = window.setInterval(read, arenaRefreshMs)

    return () => {
      active = false
      window.clearInterval(timer)
      void connections.er.removeAccountChangeListener(subscription)
    }
  }, [connections, programId, resolved, selected.id, symbol])

  const current = view.symbol === symbol ? view : emptyView
  const arena = current.arena

  const endTs = arena?.current.endTs ?? null
  useEffect(() => {
    if (endTs == null) return
    const delay = endTs * 1000 - Date.now()
    if (delay <= 0) return
    const timer = window.setTimeout(
      () => setEndedAt(Math.floor(Date.now() / 1000)),
      Math.min(delay + 50, 2_147_483_647),
    )
    return () => window.clearTimeout(timer)
  }, [endTs])

  // The clock the round is judged by: when the arena was read, or when its end time passed since then without an
  // account change. `active` only compares it with the round's end, so nothing finer is needed.
  const clock = Math.max(current.readAt, endedAt)
  const market = useMemo(() => (arena ? toArenaMarket(arena, clock) : null), [arena, clock])

  return {
    symbol,
    selected,
    market,
    arena,
    available: current.available,
    isLoading: !current.loaded,
    error: current.error,
  }
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
