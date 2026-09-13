'use client'

import MarketSelector from '@/components/market-selector'
import { useMarketCountdown } from '@/hooks/use-current-market'
import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { cn } from 'cn'
import Image from 'next/image'
import { useState } from 'react'
import Marquee from 'react-fast-marquee'

const countdownEase = 'cubic-bezier(0.23, 1, 0.32, 1)'
const countdownTiming = { duration: 350, easing: countdownEase }
const countdownDigits = { 1: { max: 5 } } as const
const countdownFormat = { minimumIntegerDigits: 2 } as const

function MarketCountdown() {
  const remaining = useMarketCountdown()
  const [previous, setPrevious] = useState(remaining)

  if (remaining !== previous) setPrevious(remaining)

  const jumped = remaining != null && previous != null && Math.abs(remaining - previous) > 1

  if (remaining == null) return <span>--:--</span>

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <NumberFlowGroup>
      <div className="flex items-baseline" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 0.85 }}>
        <NumberFlow
          value={minutes}
          trend={-1}
          digits={countdownDigits}
          format={countdownFormat}
          animated={!jumped}
          willChange
          transformTiming={countdownTiming}
          spinTiming={countdownTiming}
          opacityTiming={{ duration: 200, easing: countdownEase }}
        />
        <NumberFlow
          prefix=":"
          value={seconds}
          trend={-1}
          digits={countdownDigits}
          format={countdownFormat}
          animated={!jumped}
          willChange
          transformTiming={countdownTiming}
          spinTiming={countdownTiming}
          opacityTiming={{ duration: 200, easing: countdownEase }}
        />
      </div>
    </NumberFlowGroup>
  )
}

export default function SectionHeader() {
  return (
    // On narrow screens the island is scaled to the header width; overflow-x-clip trims its transparent edges.
    <header className="w-full h-[90px] rounded-2xl relative select-none max-md:overflow-x-clip">
      <div
        className={cn(
          'overflow-hidden w-full h-full absolute top-0 left-0 rounded-2xl',
          "bg-[url('/background-texture.webp')] bg-cover bg-center",
        )}
      >
        <div className="w-full h-full flex items-center justify-center">
          <Marquee>
            {Array.from({ length: 20 }).map((_, index) => (
              <figure key={index} className="h-[49px] px-6 flex items-center justify-center">
                <span className="font-abc-gravity-italic text-[58px] leading-none text-white opacity-90 translate-y-[3px]">
                  ROGS
                </span>
              </figure>
            ))}
          </Marquee>
        </div>
      </div>

      <figure className="w-[480px] h-auto absolute left-1/2 -translate-x-1/2 z-20 top-[-7px] max-[525px]:scale-[0.76] max-[374px]:scale-[0.7] max-[339px]:scale-[0.62]">
        <svg
          width="562"
          height="116"
          className="w-full h-full"
          viewBox="0 0 562 116"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M275.598 25.3428L286.767 46.1426L307.714 33.7305L310.03 32.3584L312.654 32.957L326.347 36.082L524.245 32.1729L531.596 28.6035L540.851 24.1055L541.285 34.3877L542.327 59.1406L546.906 63.8408L551.774 68.8369L546.619 73.5361L529.698 88.959L527.766 90.7197H310.549L294.33 97.7285L293.656 98.0195L292.935 98.1592L277.435 101.159L276.124 101.413L274.814 101.147L236.075 93.3018L35.4276 99.2793L26.6454 99.541L28.6591 90.9883L29.7323 86.4268L25.245 85.0615L15.3182 82.041L22.1053 74.1934L26.869 68.6846L14.4188 38.6094L10.327 28.7227L21.0116 29.291L245.25 41.2305L257.309 37.2744L263.708 25.3467L269.649 14.2676L275.598 25.3428Z"
            fill="black"
            stroke="#121314"
            strokeWidth="13.494"
          />
        </svg>

        <Image
          src="/mascot.png"
          alt="Rog, the Rogs Arena mascot"
          width={124}
          height={124}
          priority
          className="absolute left-[165px] top-[-13px] w-[124px] h-[124px] pointer-events-none"
        />

        <div className="w-[510px] h-[60px] font-abc-gravity-italic flex justify-between items-center text-white px-18 pt-2 leading-none absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
          <div className="text-[30px] leading-none pt-1">
            <MarketSelector />
          </div>

          <div className="text-[30px] leading-none tabular-nums">
            <MarketCountdown />
          </div>
        </div>
      </figure>
    </header>
  )
}
