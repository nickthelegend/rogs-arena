'use client'

import { useCurrentMarket } from '@/hooks/use-current-market'
import { BTC_ASSET, BTC_COLOR, BTC_PRICE_TICKS, BTC_PRICE_WINDOWS } from '@/lib/btc'
import { createDreamDexExchange } from '@/lib/dreamdex'
import { formatChange, formatChartTime, formatUsd } from '@/lib/format'
import { Liveline } from '@/lib/liveline'
import { interpolateAtTime } from '@/lib/liveline/math/interpolate'
import { NO_COLOR, YES_COLOR } from '@/lib/outcome'
import {
  candleWidthForWindow,
  livePriceToPoint,
  normalizePricePoints,
  pointsToCandles,
  tickToLivelinePoint,
} from '@/lib/utils'
import { isBinaryMarket } from '@somnia-chain/markets-sdk'
import { SomniaMarketsProvider, useLivePrice, useLivePriceTicks, useWatchPrice } from '@somnia-chain/markets-sdk/react'
import { useMemo, useState } from 'react'

const defaultWindowSecs = BTC_PRICE_WINDOWS[0]?.secs ?? 60

function BtcPriceFeed() {
  const { market } = useCurrentMarket()
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line')
  const [windowSecs, setWindowSecs] = useState(defaultWindowSecs)
  const priceStatus = useWatchPrice(BTC_ASSET)
  const btcPrice = useLivePrice(BTC_ASSET)
  const btcPriceTicks = useLivePriceTicks(BTC_ASSET, BTC_PRICE_TICKS)
  const btcPricePoints = useMemo(() => {
    const points = btcPriceTicks.map(tickToLivelinePoint)
    if (btcPrice) points.push(livePriceToPoint(btcPrice))
    return normalizePricePoints(points)
  }, [btcPrice, btcPriceTicks])
  const candleWidth = candleWidthForWindow(windowSecs)
  const { candles, liveCandle } = useMemo(
    () => pointsToCandles(btcPricePoints, candleWidth),
    [btcPricePoints, candleWidth],
  )
  const marketOpenPrice = useMemo(() => {
    if (!market || !isBinaryMarket(market.info)) return undefined

    const tradingStart = Number(market.info.tradingStart)
    if (!Number.isFinite(tradingStart)) return undefined

    return interpolateAtTime(btcPricePoints, tradingStart) ?? undefined
  }, [btcPricePoints, market])
  const marketReferenceLine = useMemo(
    () => (marketOpenPrice == null ? undefined : { value: marketOpenPrice, label: formatUsd(marketOpenPrice) }),
    [marketOpenPrice],
  )
  const isLoadingBtcPrice = priceStatus === 'hydrating' && btcPricePoints.length === 0
  const first = btcPricePoints.at(0)
  const latestValue = btcPrice?.price ?? btcPricePoints.at(-1)?.value
  const change = first && latestValue !== undefined ? latestValue - first.value : undefined
  const changePercent = change !== undefined && first && first.value !== 0 ? change / first.value : undefined
  const changeTone = change === undefined ? '#6A7374' : change >= 0 ? '#31DC0E' : '#DC220E'

  return (
    <section className="section-panel flex min-h-0 flex-col overflow-hidden p-2 px-0 relative">
      <header className="mb-2 flex flex-none items-start justify-between gap-4 absolute top-3 right-3">
        <div className="text-right">
          <p className="font-sans text-[28px] font-medium tabular-nums tracking-tight text-white">
            {formatUsd(latestValue)}
          </p>
          <p
            className="mt-2 font-sans text-sm tabular-nums transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ color: changeTone }}
          >
            {formatChange(change, changePercent)}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 ">
        <div className="absolute inset-0 grid w-full pr-2 grid-rows-[auto_minmax(0,1fr)]">
          <Liveline
            className="min-h-0"
            data={btcPricePoints}
            value={latestValue ?? 0}
            color={BTC_COLOR}
            theme="dark"
            window={windowSecs}
            windows={BTC_PRICE_WINDOWS}
            onWindowChange={setWindowSecs}
            windowStyle="rounded"
            lineMode={chartMode === 'line'}
            onModeChange={setChartMode}
            candles={candles}
            candleWidth={candleWidth}
            liveCandle={liveCandle}
            lineData={btcPricePoints}
            lineValue={latestValue}
            loading={isLoadingBtcPrice}
            emptyText="Waiting for BTC price..."
            formatValue={formatUsd}
            formatTime={formatChartTime}
            tooltip={false}
            referenceLine={marketReferenceLine}
            valueMomentumColor
            exaggerate
            momentum
            degen
            pulse
            lineWidth={3}
            scrub={false}
          />
        </div>
      </div>
    </section>
  )
}

export default function SectionChartBtc() {
  const exchange = useMemo(() => createDreamDexExchange(), [])

  return (
    <SomniaMarketsProvider client={exchange.client}>
      <BtcPriceFeed />
    </SomniaMarketsProvider>
  )
}
