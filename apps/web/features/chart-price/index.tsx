'use client'

import { CoinLogo } from '@/components/coin-logo'
import { useCurrentMarket } from '@/hooks/use-current-market'
import { useMarketPrice } from '@/hooks/use-market-price'
import { useNarrowLayout } from '@/hooks/use-narrow-layout'
import { formatChartTime, formatMarketChange, formatMarketPrice } from '@/lib/format'
import { Liveline } from '@/lib/liveline'
import { PRICE_WINDOWS } from '@/lib/price-chart'
import { candleWidthForWindow, pointsToCandles } from '@/lib/utils'
import { rawPriceToNumber } from '@rogs/arena-sdk'
import { useCallback, useMemo, useState } from 'react'

const defaultWindowSecs = PRICE_WINDOWS[0]?.secs ?? 60
// The price and its change sit over the chart's top-right corner, where the live badge and dot ride at the plot's
// top edge. Starting the plot 40px down keeps both below the change label for any price length. The stacked narrow
// layout puts that header above the chart, so the default padding applies there.
const overlaidHeaderPadding = { top: 40 }

function MarketPriceFeed() {
  const { market } = useCurrentMarket()
  const narrow = useNarrowLayout()
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line')
  const [windowSecs, setWindowSecs] = useState(defaultWindowSecs)
  const {
    latest,
    points: pricePoints,
    status: priceStatus,
    error: priceError,
    symbol,
    market: coin,
  } = useMarketPrice({ history: true })
  const decimals = coin.priceDecimals
  const formatPrice = useCallback((value: number) => formatMarketPrice(value, decimals), [decimals])
  const candleWidth = candleWidthForWindow(windowSecs)
  const { candles, liveCandle } = useMemo(
    () => pointsToCandles(pricePoints, candleWidth),
    [pricePoints, candleWidth],
  )
  // The round's strike is the oracle price the program read on-chain when the round opened.
  const marketOpenPrice = useMemo(() => {
    if (!market || market.market !== coin.id || market.strikePrice <= 0n) return undefined
    return rawPriceToNumber(market.strikePrice, market.priceExpo)
  }, [coin.id, market])
  const marketReferenceLine = useMemo(
    () => (marketOpenPrice == null ? undefined : { value: marketOpenPrice, label: formatPrice(marketOpenPrice) }),
    [formatPrice, marketOpenPrice],
  )
  const isLoadingPrice = priceStatus === 'hydrating' && pricePoints.length === 0
  const first = pricePoints.at(0)
  const latestValue = latest?.price ?? pricePoints.at(-1)?.value
  const change = first && latestValue !== undefined ? latestValue - first.value : undefined
  const changePercent = change !== undefined && first && first.value !== 0 ? change / first.value : undefined
  const changeTone = change === undefined ? '#6A7374' : change >= 0 ? '#31DC0E' : '#DC220E'

  return (
    <section className="section-panel flex min-h-0 flex-col overflow-hidden p-2 px-0 relative max-md:h-[340px] max-md:flex-none">
      <header className="mb-2 flex flex-none items-start justify-between gap-4 absolute top-3 right-3 max-md:static max-md:justify-end max-md:px-3 max-md:pt-1">
        <div className="text-right">
          <p className="flex items-center justify-end gap-2 font-sans text-[28px] font-medium tabular-nums tracking-tight text-white">
            <CoinLogo symbol={symbol} className="size-7" />
            {formatMarketPrice(latestValue, decimals)}
          </p>
          <p
            className="mt-2 font-sans text-sm tabular-nums transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ color: changeTone }}
          >
            {formatMarketChange(change, changePercent, decimals)}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 ">
        <div className="absolute inset-0 grid w-full pr-2 grid-rows-[auto_minmax(0,1fr)]">
          <Liveline
            // A new coin starts a new chart: its range and momentum must not animate out of the previous coin's.
            key={symbol}
            className="min-h-0"
            data={pricePoints}
            value={latestValue ?? 0}
            color={coin.color}
            theme="dark"
            window={windowSecs}
            windows={PRICE_WINDOWS}
            onWindowChange={setWindowSecs}
            windowStyle="rounded"
            lineMode={chartMode === 'line'}
            onModeChange={setChartMode}
            candles={candles}
            candleWidth={candleWidth}
            liveCandle={liveCandle}
            lineData={pricePoints}
            lineValue={latestValue}
            loading={isLoadingPrice}
            emptyText={priceError ?? `Waiting for ${symbol} price...`}
            formatValue={formatPrice}
            formatTime={formatChartTime}
            tooltip={false}
            padding={narrow ? undefined : overlaidHeaderPadding}
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

export default function SectionChartPrice() {
  return <MarketPriceFeed />
}
