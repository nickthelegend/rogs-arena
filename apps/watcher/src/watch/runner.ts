import {
  defaultInterval,
  dreamDexConfig,
  intervalSecondsByLabel,
  marketRefreshMs,
  reconnectDelayMs,
  targetMarketLabel,
  type IntervalOption,
} from '@/config'
import { discoverTargetMarkets } from '@/extract/discovery'
import { errorMessage, sleep } from '@/lib/async'
import { switchingSnapshot } from '@/transform/snapshot'
import type { DashboardMarket, SnapshotListener, WatcherSnapshot } from '@/types'
import { SomniaMarkets, type UnifiedMarket } from '@somnia-chain/markets-sdk'
import { watchMarket } from './market'

function withMarkets(snapshot: WatcherSnapshot, markets: DashboardMarket[]): WatcherSnapshot {
  return { ...snapshot, markets }
}

export async function startWatcher(
  onSnapshot: SnapshotListener,
  signal: AbortSignal,
  interval: IntervalOption = defaultInterval,
) {
  const intervalSeconds = intervalSecondsByLabel[interval]
  const marketLabel = targetMarketLabel(interval)
  let markets: DashboardMarket[] = []
  let last: WatcherSnapshot = {
    phase: 'connecting',
    message: 'Connecting to DreamDex',
    fillCount: 0,
    fills: [],
    trades: [],
    markets,
  }

  const emit: SnapshotListener = (snapshot) => {
    last = withMarkets(snapshot, markets)
    onSnapshot(last)
  }

  const setMarkets = (next: DashboardMarket[]) => {
    markets = next
    emit(last)
  }

  emit({
    phase: 'connecting',
    message: 'Connecting to DreamDex',
    fillCount: 0,
    fills: [],
    trades: [],
  })

  while (!signal.aborted) {
    const exchange = new SomniaMarkets(dreamDexConfig)
    let previousMarket: UnifiedMarket | undefined

    try {
      while (!signal.aborted) {
        const discovery = await discoverTargetMarkets(exchange, intervalSeconds)
        if (signal.aborted) return

        setMarkets(discovery.markets)
        const market = discovery.current

        if (!market) {
          emit({
            phase: 'waiting',
            message: previousMarket
              ? `${previousMarket.symbol} expired · waiting for the next ${marketLabel}`
              : `Waiting for a live ${marketLabel} market`,
            retryAt: Date.now() + marketRefreshMs,
            fillCount: 0,
            fills: [],
            trades: [],
          })
          previousMarket = undefined
          await sleep(marketRefreshMs, signal)
          continue
        }

        if (previousMarket && previousMarket.id !== market.id) {
          emit(switchingSnapshot(market, `Switched to ${market.symbol}`))
        }

        const result = await watchMarket(exchange, market, emit, signal, intervalSeconds, (next) => {
          setMarkets(next.markets)
        })
        if (signal.aborted) return

        previousMarket = market

        if (result?.event === 'market_changed') {
          emit(switchingSnapshot(result.market, `${market.symbol} rolled · switching`))
          continue
        }

        emit(switchingSnapshot(market, `${market.symbol} expired · switching`))
      }
    } catch (error) {
      if (signal.aborted) return

      emit({
        phase: 'error',
        message: errorMessage(error),
        retryAt: Date.now() + reconnectDelayMs,
        fillCount: 0,
        fills: [],
        trades: [],
      })
      await sleep(reconnectDelayMs, signal)
    } finally {
      await exchange.close()
    }
  }
}
