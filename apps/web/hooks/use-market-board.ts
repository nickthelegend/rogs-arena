'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { ArenaApiError, getMarkets, type MarketDto } from '@/lib/arena-api'
import { arenaRealtime } from '@/lib/arena-realtime'
import { errorMessage } from '@/lib/error'
import {
  MARKET_SYMBOLS,
  marketConfig,
  marketOracleFeed,
  marketUnavailableReason,
  parseMarketSymbol,
  type MarketRoundClock,
  type MarketRounds,
  type MarketSymbol,
} from '@/lib/markets'
import { arenaPda, decodeArena, decodePriceUpdate, type MarketConfig, type OraclePrice } from '@rogs/arena-sdk'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const ARENA_POLL_MS = 15_000
const PRICE_FLUSH_MS = 1_000
const PRICE_STALE_MS = 5_000

export type MarketBoardEntry = {
  symbol: MarketSymbol
  config: MarketConfig
  /** null until the first read; false while the coin's arena account is not on the ephemeral rollup. */
  available: boolean | null
  reason: string | null
  round: MarketRoundClock | null
  price: number | null
  priceError: string | null
}

type MarketBoardValue = {
  entries: MarketBoardEntry[]
  /** Latest round per market id, read from every arena account; settling and heart reports use it. */
  rounds: MarketRounds
  /** Streams every coin's oracle price (flushed once a second) until the returned release is called. */
  watchPrices: () => () => void
  error: string | null
}

type ChainArena = { exists: boolean; round: MarketRoundClock | null }
type BoardPrice = { price: number | null; error: string | null }

const MarketBoardContext = createContext<MarketBoardValue | null>(null)
const configs = MARKET_SYMBOLS.map(marketConfig)

function useMarketBoardLoader(): MarketBoardValue {
  const { connections, programId, oracleFeed } = useArenaChain()
  const [chain, setChain] = useState<Partial<Record<number, ChainArena>>>({})
  const [service, setService] = useState<Partial<Record<number, MarketDto>>>({})
  const [prices, setPrices] = useState<Partial<Record<number, BoardPrice>>>({})
  const [error, setError] = useState<string | null>(null)
  const [watchers, setWatchers] = useState(0)

  // Every arena account in one batched rollup read. A coin's account appears once its market is bootstrapped.
  useEffect(() => {
    let active = true
    const addresses = configs.map((config) => arenaPda(programId, config.id))

    const read = async () => {
      try {
        const accounts = await connections.er.getMultipleAccountsInfo(addresses, 'confirmed')
        if (!active) return
        const next: Partial<Record<number, ChainArena>> = {}
        configs.forEach((config, index) => {
          const account = accounts[index]
          const address = addresses[index]
          if (!account || !address) {
            next[config.id] = { exists: false, round: null }
            return
          }
          const arena = decodeArena(address, account.data)
          next[config.id] = {
            exists: true,
            round: { id: arena.current.id, status: arena.current.status, endTs: arena.current.endTs },
          }
        })
        setChain(next)
        setError(null)
      } catch (cause) {
        if (active) setError(`Could not read the coin arenas on the MagicBlock rollup: ${errorMessage(cause)}`)
      }
    }

    void read()
    const timer = window.setInterval(read, ARENA_POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [connections, programId])

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined

    const load = async () => {
      try {
        const markets = await getMarkets(controller.signal)
        const next: Partial<Record<number, MarketDto>> = {}
        for (const dto of markets) {
          const symbol = parseMarketSymbol(dto.market)
          if (symbol) next[marketConfig(symbol).id] = dto
        }
        setService(next)
        arenaRealtime().setMarketsApi(true)
      } catch (cause) {
        if (controller.signal.aborted) return
        // The single-market service has no /api/markets: availability then comes from the rollup alone.
        if (cause instanceof ArenaApiError && cause.status === 404) return
      }
      timer = window.setTimeout(load, ARENA_POLL_MS)
    }

    void load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])

  const watchPrices = useCallback(() => {
    setWatchers((count) => count + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setWatchers((count) => count - 1)
    }
  }, [])

  const watching = watchers > 0
  useEffect(() => {
    if (!watching) return

    let active = true
    let dirty = false
    let reading = false
    let lastUpdateAt = 0
    const feeds = configs.map((config) => marketOracleFeed(config, oracleFeed))
    const latest = new Map<number, BoardPrice & { slot: bigint }>()

    const accept = (id: number, update: OraclePrice) => {
      const previous = latest.get(id)
      if (previous && update.postedSlot <= previous.slot) return
      latest.set(id, { price: update.price, error: null, slot: update.postedSlot })
      lastUpdateAt = Date.now()
      dirty = true
    }
    const fail = (id: number, cause: unknown) => {
      const previous = latest.get(id)
      latest.set(id, { price: previous?.price ?? null, error: errorMessage(cause), slot: previous?.slot ?? -1n })
      dirty = true
    }
    const flush = () => {
      if (!active || !dirty) return
      dirty = false
      const next: Partial<Record<number, BoardPrice>> = {}
      for (const [id, value] of latest) next[id] = { price: value.price, error: value.error }
      setPrices(next)
    }
    const readAll = async () => {
      if (reading) return
      reading = true
      try {
        const accounts = await connections.er.getMultipleAccountsInfo(feeds, 'confirmed')
        if (!active) return
        configs.forEach((config, index) => {
          const feed = feeds[index]
          const account = accounts[index]
          if (!feed) return
          if (!account) {
            fail(config.id, new Error(`${config.symbol}/USD feed was not found on the ephemeral rollup`))
            return
          }
          try {
            accept(config.id, decodePriceUpdate(feed, account.data, account.owner))
          } catch (cause) {
            fail(config.id, cause)
          }
        })
        lastUpdateAt = Date.now()
        flush()
      } catch (cause) {
        if (!active) return
        for (const config of configs) fail(config.id, cause)
        flush()
      } finally {
        reading = false
      }
    }

    const subscriptions = feeds.map((feed, index) =>
      connections.er.onAccountChange(
        feed,
        (account) => {
          const config = configs[index]
          if (!active || !config) return
          try {
            accept(config.id, decodePriceUpdate(feed, account.data, account.owner))
          } catch (cause) {
            fail(config.id, cause)
          }
        },
        { commitment: 'confirmed' },
      ),
    )
    void readAll()
    // Oracle accounts tick many times a second; the board repaints once a second and re-reads if the socket stalls.
    const timer = window.setInterval(() => {
      flush()
      if (Date.now() - lastUpdateAt > PRICE_STALE_MS) void readAll()
    }, PRICE_FLUSH_MS)

    return () => {
      active = false
      window.clearInterval(timer)
      for (const subscription of subscriptions) void connections.er.removeAccountChangeListener(subscription)
    }
  }, [connections, oracleFeed, watching])

  const entries = useMemo(
    () =>
      configs.map((config): MarketBoardEntry => {
        const symbol = config.symbol as MarketSymbol
        const onChain = chain[config.id]
        const dto = service[config.id]
        // The rollup account is the truth; the service's flag only fills in before the first rollup read lands.
        const available = onChain ? onChain.exists : dto ? dto.available : null
        const price = prices[config.id]
        return {
          symbol,
          config,
          available,
          reason: available === false ? marketUnavailableReason(symbol) : null,
          round: onChain?.round ?? null,
          price: price?.price ?? null,
          priceError: price?.error ?? null,
        }
      }),
    [chain, prices, service],
  )

  const rounds = useMemo(() => {
    const next: Partial<Record<number, MarketRoundClock | null>> = {}
    for (const [id, arena] of Object.entries(chain)) {
      if (arena) next[Number(id)] = arena.round
    }
    return next as MarketRounds
  }, [chain])

  return useMemo(() => ({ entries, rounds, watchPrices, error }), [entries, error, rounds, watchPrices])
}

export function MarketBoardProvider({ children }: { children: ReactNode }) {
  const value = useMarketBoardLoader()
  return createElement(MarketBoardContext.Provider, { value }, children)
}

export function useMarketBoard() {
  const context = useContext(MarketBoardContext)
  if (!context) throw new Error('useMarketBoard must be used within MarketBoardProvider')
  return context
}
