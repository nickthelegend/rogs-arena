import { discoverTargetMarkets, pickTradable, type MarketDiscovery } from '@/extract/discovery'
import { marketValues } from '@/extract/values'
import { sleep, waitUntilAborted } from '@/lib/async'
import { marketMeta, snapshotFromValue } from '@/transform/snapshot'
import type { SnapshotListener, WatchResult } from '@/types'
import { isBinaryMarket, SomniaMarkets, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { isMarketExpired, successorPollMs, waitUntilMarketExpiry } from './expiry'

export async function waitForMarketSwitch(
  exchange: SomniaMarkets,
  currentMarket: UnifiedMarket,
  signal: AbortSignal,
  intervalSeconds: number,
  onDiscovery?: (discovery: MarketDiscovery) => void,
): Promise<WatchResult | void> {
  while (!signal.aborted) {
    await sleep(successorPollMs(currentMarket), signal)
    if (signal.aborted) return

    if (isMarketExpired(currentMarket)) {
      return { event: 'market_expired' }
    }

    try {
      const discovery = await discoverTargetMarkets(exchange, intervalSeconds)
      if (signal.aborted) return

      onDiscovery?.(discovery)

      if (discovery.current && discovery.current.id !== currentMarket.id) {
        return { event: 'market_changed', market: discovery.current }
      }
    } catch {
      // Indexer/registry blips should not tear down the live book subscription.
    }
  }
}

async function watchMarketValue(
  exchange: SomniaMarkets,
  market: UnifiedMarket,
  onSnapshot: SnapshotListener,
  signal: AbortSignal,
) {
  if (!isBinaryMarket(market.info)) {
    throw new Error(`Market ${market.symbol} is not a binary market`)
  }

  const handle = await exchange.client.watchMarket(market.info.poolAddress)
  let previousYes: number | undefined
  let hydrated = false

  const publish = () => {
    if (signal.aborted) return
    if (isMarketExpired(market)) return

    const value = marketValues(exchange, market)
    if (!value) return

    if (!hydrated) {
      hydrated = true
      previousYes = value.yesValue
      onSnapshot(snapshotFromValue(market, value))
      return
    }

    if (value.source === 'default' && previousYes !== undefined) return

    previousYes = value.yesValue
    onSnapshot(snapshotFromValue(market, value))
  }

  const unsubscribe = exchange.client.subscribeLive(publish)

  try {
    publish()
    await waitUntilAborted(signal)
  } finally {
    unsubscribe()
    handle.stop()
  }
}

export async function watchMarket(
  exchange: SomniaMarkets,
  market: UnifiedMarket,
  onSnapshot: SnapshotListener,
  signal: AbortSignal,
  intervalSeconds: number,
  onDiscovery?: (discovery: MarketDiscovery) => void,
) {
  const yesSymbol = pickTradable(market, 'YES')
  const noSymbol = pickTradable(market, 'NO')

  if (!yesSymbol || !noSymbol) {
    throw new Error(`Market ${market.symbol} does not expose both YES and NO outcomes`)
  }

  onSnapshot({
    phase: 'watching',
    message: 'Hydrating live book',
    ...marketMeta(market),
    fillCount: 0,
    fills: [],
    trades: [],
    updatedAt: Date.now(),
  })

  const controller = new AbortController()
  const stop = () => controller.abort()
  signal.addEventListener('abort', stop, { once: true })

  try {
    return await Promise.race<WatchResult | void>([
      watchMarketValue(exchange, market, onSnapshot, controller.signal),
      waitForMarketSwitch(exchange, market, controller.signal, intervalSeconds, onDiscovery),
      waitUntilMarketExpiry(market, controller.signal),
    ])
  } finally {
    signal.removeEventListener('abort', stop)
    controller.abort()
  }
}
