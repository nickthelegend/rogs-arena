'use client'

import { useBtcPrice } from '@/hooks/use-btc-price'
import { useCurrentMarket } from '@/hooks/use-current-market'
import { BTC_COLOR, BTC_PRICE_WINDOWS } from '@/lib/btc'
import { formatChange, formatChartTime, formatUsd } from '@/lib/format'
import { Liveline } from '@/lib/liveline'
import { candleWidthForWindow, pointsToCandles } from '@/lib/utils'
import { rawPriceToNumber } from '@rogs/arena-sdk'
import { useMemo, useState } from 'react'

const defaultWindowSecs = BTC_PRICE_WINDOWS[0]?.secs ?? 60

function BtcPriceFeed() {
  const { market } = useCurrentMarket()
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line')
  const [windowSecs, setWindowSecs] = useState(defaultWindowSecs)
  const { latest, points: btcPricePoints, status: priceStatus, error: priceError } = useBtcPrice()
  const candleWidth = candleWidthForWindow(windowSecs)
  const { candles, liveCandle } = useMemo(
    () => pointsToCandles(btcPricePoints, candleWidth),
    [btcPricePoints, candleWidth],
  )
  // The round's strike is the oracle price the program read on-chain when the round opened.
  const marketOpenPrice = useMemo(() => {
    if (!market || market.strikePrice <= 0n) return undefined
    return rawPriceToNumber(market.strikePrice, market.priceExpo)
  }, [market])
  const marketReferenceLine = useMemo(
    () => (marketOpenPrice == null ? undefined : { value: marketOpenPrice, label: formatUsd(marketOpenPrice) }),
    [marketOpenPrice],
  )
  const isLoadingBtcPrice = priceStatus === 'hydrating' && btcPricePoints.length === 0
  const first = btcPricePoints.at(0)
  const latestValue = latest?.price ?? btcPricePoints.at(-1)?.value
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
            emptyText={priceError ?? 'Waiting for BTC price...'}
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
  return <BtcPriceFeed />
}
