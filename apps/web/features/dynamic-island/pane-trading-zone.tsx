'use client'

import { currentMarketIds } from '@/hooks/use-current-market'
import { useAbility } from '@/components/ability-provider'
import { useHeartRate } from '@/hooks/use-heart-rate'
import { useMarketTimeseries } from '@/hooks/use-market-timeseries'
import { useMarketTrades } from '@/hooks/use-market-trades'
import { useTrading } from '@/hooks/use-trading'
import { formatShares } from '@/lib/format'
import { floatingProfitsForTrader } from '@/lib/leaderboard'
import { DEFAULT_TRADE_AMOUNT } from '@/lib/trading'
import NumberFlow from '@number-flow/react'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import upTexture from '@/public/texture-up.png'
import downTexture from '@/public/texture-down.png'
import { BPM_TIMING } from './constants'
import Spinner from './spinner'

const TRADE_AMOUNT_STEP = 2
const PROFIT_COLOR = '#31DC0E'
const LOSS_COLOR = '#DC220E'

function positionLabel(shares: number, side: 'UP' | 'DOWN') {
  return `${formatShares(shares)} ${side}`
}

function exitLabel(profit: number) {
  return profit < 0 ? 'SL' : 'TP'
}

function exitColor(label: ReturnType<typeof exitLabel>) {
  return label === 'TP' ? PROFIT_COLOR : LOSS_COLOR
}

export default function PaneTradingZone({
  heartRate,
  reduceMotion,
  onBack,
}: {
  heartRate: ReturnType<typeof useHeartRate>
  reduceMotion: boolean
  onBack: () => void
}) {
  const {
    status,
    tradingOutcome,
    isTrading,
    isLoadingPositions,
    isLoadingMarket,
    canTrade,
    canTakeProfit,
    yesPosition,
    noPosition,
    address,
    market,
    isTakingProfit,
    placeTrade,
    takeProfit,
  } = useTrading()
  const { applied, bindApplied } = useAbility()
  const [amount, setAmount] = useState(DEFAULT_TRADE_AMOUNT)
  const marketIds = useMemo(() => currentMarketIds(market), [market])
  const { trades } = useMarketTrades(marketIds)
  const { points } = useMarketTimeseries(marketIds)
  const latest = points.at(-1)
  const yesMark = latest?.yes
  const noMark = latest?.no ?? (yesMark == null ? undefined : 1 - yesMark)
  const profits = useMemo(
    () => floatingProfitsForTrader(trades, { yes: yesMark, no: noMark }, address),
    [address, noMark, trades, yesMark],
  )
  const floatingProfit = profits.YES + profits.NO
  const yesExit = exitLabel(profits.YES)
  const noExit = exitLabel(profits.NO)

  const statusTone =
    status?.tone === 'error' ? 'text-[#F87171]' : status?.tone === 'success' ? 'text-white' : 'text-white/70'
  const detail =
    status?.message ??
    (isLoadingMarket
      ? 'Loading live market...'
      : isLoadingPositions
        ? 'Syncing positions...'
        : `${amount} tUSDC per trade`)
  const canExitYes = canTakeProfit && yesPosition > 0
  const canExitNo = canTakeProfit && noPosition > 0
  const buyingYes = isTrading && !isTakingProfit && tradingOutcome === 'YES'
  const buyingNo = isTrading && !isTakingProfit && tradingOutcome === 'NO'
  const canAdjustAmount = !isTrading
  const bpmTiming = {
    transformTiming: BPM_TIMING,
    spinTiming: BPM_TIMING,
    opacityTiming: { duration: 150, easing: BPM_TIMING.easing },
  } as const

  function bumpAmount(delta: number) {
    setAmount((current) => Math.max(TRADE_AMOUNT_STEP, current + delta))
  }

  function progressHint(profit: number) {
    return { profit, heartRate: { live: heartRate.live, bpm: heartRate.bpm } }
  }

  async function buy(outcome: 'YES' | 'NO') {
    const result = await placeTrade(outcome, 'buy', amount, applied?.id)
    if (result?.abilityPlay) bindApplied()
  }

  return (
    <div className="flex h-full w-full gap-2 pointer-events-none">
      {heartRate.bpm && (
        <div id="bpm" className="absolute w-[400px] h-[100px] top-[-80px] left-1/2 -translate-x-1/2 z-0">
          <figure className="w-full h-full">
            <svg
              className="w-full h-auto"
              width="366"
              height="81"
              viewBox="0 0 366 81"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <mask
                id="path-1-outside-1_2205_11733"
                maskUnits="userSpaceOnUse"
                x="-0.43988"
                y="0"
                width="366"
                height="81"
                fill="black"
              >
                <rect fill="white" x="-0.43988" width="366" height="81" />
                <path d="M182.578 8C206.903 8.00002 225.694 11.1155 241.44 16.3174C257.195 21.5224 269.296 28.6238 280.188 35.7783C301.766 49.9517 318.1 63.6944 352.703 70.5732L363.596 72.7393H1.56012L12.4537 70.5732C47.0562 63.6943 63.3907 49.9517 84.9683 35.7783C95.8604 28.6238 107.961 21.5223 123.716 16.3174C139.462 11.1155 158.252 8.00003 182.578 8ZM299.501 64.8564C299.857 65.0675 300.216 65.2774 300.576 65.4873C299.855 65.0674 299.142 64.6451 298.435 64.2207L299.501 64.8564Z" />
              </mask>
              <path
                d="M182.578 8C206.903 8.00002 225.694 11.1155 241.44 16.3174C257.195 21.5224 269.296 28.6238 280.188 35.7783C301.766 49.9517 318.1 63.6944 352.703 70.5732L363.596 72.7393H1.56012L12.4537 70.5732C47.0562 63.6943 63.3907 49.9517 84.9683 35.7783C95.8604 28.6238 107.961 21.5223 123.716 16.3174C139.462 11.1155 158.252 8.00003 182.578 8ZM299.501 64.8564C299.857 65.0675 300.216 65.2774 300.576 65.4873C299.855 65.0674 299.142 64.6451 298.435 64.2207L299.501 64.8564Z"
                fill="#1A1A1A"
              />
              <path
                d="M182.578 8V0H182.578L182.578 8ZM241.44 16.3174L243.95 8.7212L243.95 8.72119L241.44 16.3174ZM280.188 35.7783L284.58 29.0918V29.0918L280.188 35.7783ZM352.703 70.5732L354.263 62.7268L354.263 62.7268L352.703 70.5732ZM363.596 72.7393V80.7393L365.156 64.8929L363.596 72.7393ZM1.56012 72.7393L-1.5974e-05 64.8929L1.56012 80.7393V72.7393ZM12.4537 70.5732L10.8938 62.7268L10.8935 62.7268L12.4537 70.5732ZM84.9683 35.7783L80.5762 29.0918L80.5762 29.0918L84.9683 35.7783ZM123.716 16.3174L121.207 8.72118L121.207 8.72119L123.716 16.3174ZM299.501 64.8564L295.401 71.7264L295.414 71.7339L295.426 71.7413L299.501 64.8564ZM298.435 64.2207L302.534 57.3508L294.318 71.0798L298.435 64.2207ZM182.578 8V16C206.201 16 224.126 19.0226 238.93 23.9136L241.44 16.3174L243.95 8.72119C227.263 3.2084 207.606 2.14577e-05 182.578 0V8ZM241.44 16.3174L238.93 23.9136C253.739 28.806 265.175 35.4881 275.796 42.4648L280.188 35.7783L284.58 29.0918C273.417 21.7595 260.65 14.2387 243.95 8.7212L241.44 16.3174ZM280.188 35.7783L275.796 42.4648C296.937 56.3516 314.685 71.172 351.143 78.4197L352.703 70.5732L354.263 62.7268C321.515 56.2167 306.594 43.5518 284.58 29.0918L280.188 35.7783ZM352.703 70.5732L351.143 78.4196L362.036 80.5857L363.596 72.7393L365.156 64.8929L354.263 62.7268L352.703 70.5732ZM363.596 72.7393V64.7393H1.56012V72.7393V80.7393H363.596V72.7393ZM1.56012 72.7393L3.12026 80.5857L14.0138 78.4196L12.4537 70.5732L10.8935 62.7268L-1.5974e-05 64.8929L1.56012 72.7393ZM12.4537 70.5732L14.0135 78.4197C50.4714 71.1719 68.2191 56.3516 89.3604 42.4648L84.9683 35.7783L80.5762 29.0918C58.5623 43.5518 43.6411 56.2167 10.8938 62.7268L12.4537 70.5732ZM84.9683 35.7783L89.3604 42.4648C99.9818 35.4881 111.417 28.806 126.226 23.9136L123.716 16.3174L121.207 8.72119C104.506 14.2387 91.739 21.7595 80.5762 29.0918L84.9683 35.7783ZM123.716 16.3174L126.226 23.9136C141.031 19.0226 158.955 16 182.578 16L182.578 8L182.578 0C157.55 2.95639e-05 137.894 3.20846 121.207 8.72118L123.716 16.3174ZM299.501 64.8564L295.426 71.7413C295.803 71.9645 296.178 72.184 296.547 72.3988L300.576 65.4873L304.605 58.5758C304.253 58.3709 303.911 58.1705 303.575 57.9716L299.501 64.8564ZM300.576 65.4873L304.605 58.5758C303.915 58.1741 303.232 57.7693 302.552 57.3616L298.435 64.2207L294.318 71.0798C295.053 71.5209 295.796 71.9608 296.547 72.3988L300.576 65.4873ZM298.435 64.2207L294.336 71.0906L295.401 71.7264L299.501 64.8564L303.6 57.9865L302.534 57.3508L298.435 64.2207Z"
                fill="#121314"
                mask="url(#path-1-outside-1_2205_11733)"
              />
            </svg>
          </figure>

          <div id="speedometer" className="absolute flex justify-center items-center w-full h-full top-0 left-0 z-0">
            <svg width="289" height="56" viewBox="0 0 289 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M144.207 0C191.437 4.15888e-05 215.211 12.0681 236.618 26.0205C252.511 36.379 266.65 47.391 288.414 55.2939H267.119C253.642 48.3116 242.948 40.3964 231.93 33.2148C211.624 19.9805 189.454 8.58793 144.207 8.58789C98.9603 8.58795 76.7909 19.9806 56.4854 33.2148C45.4665 40.3964 34.7724 48.3115 21.2949 55.2939H0C21.7637 47.391 35.9026 36.3791 51.7959 26.0205C73.2034 12.068 96.977 5.71828e-05 144.207 0Z"
                fill="#ffffff20"
              />
            </svg>
          </div>

          <div className="w-full h-full absolute top-0 left-0 z-0 pt-6 flex justify-center items-center">
            <div
              id="speedometer-value"
              className="flex items-end font-abc-gravity-italic text-[32px] leading-none text-white"
              style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 0.85 }}
            >
              {heartRate.bpm == null ? (
                <span className="text-white/45">—</span>
              ) : (
                <NumberFlow value={heartRate.bpm} animated={!reduceMotion} {...bpmTiming} />
              )}
              <span className="mb-3 ml-1 font-sans text-[14px] leading-none text-white/50">BPM</span>
            </div>
          </div>
        </div>
      )}

      <div className="absolute w-full h-[80px] top-[-40px] flex justify-between">
        <div>
          <svg width="323" height="78" viewBox="0 0 323 78" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M206.764 4C216.755 4 225.287 10.194 230.122 18.166C233.599 23.8991 238.418 30.3132 244.4 34.7998C257.137 44.3518 275.29 45.9889 294.555 44.5215C301.198 43.4698 306.438 44.301 310.369 46.7939C314.353 49.3205 316.351 53.1451 317.303 56.7217C318.244 60.2625 318.241 63.823 318.043 66.3857C317.942 67.69 317.787 68.7917 317.654 69.5771C317.588 69.9708 317.527 70.2885 317.48 70.5156C317.457 70.6289 317.438 70.7199 317.423 70.7871C317.415 70.8206 317.409 70.8487 317.404 70.8701C317.402 70.8807 317.399 70.8899 317.397 70.8975C317.397 70.9013 317.396 70.9052 317.396 70.9082C317.395 70.9096 317.395 70.9113 317.395 70.9121L313.5 70L317.394 70.916L316.668 74H-4V24C-4 12.9543 4.95431 4 16 4H206.764Z"
              fill="#1A1A1A"
              stroke="#121314"
              strokeWidth="8"
            />
            <mask
              id="mask0_2209_11748"
              style={{ maskType: 'alpha' }}
              maskUnits="userSpaceOnUse"
              x="0"
              y="8"
              width="315"
              height="62"
            >
              <path
                d="M0 8H206.764C215.039 8 222.411 13.1644 226.702 20.2402C230.305 26.1811 235.439 33.079 242 38C256 48.5 275.5 50 295 48.5C319.5 44.5 313.5 69.9998 313.5 69.9998H0V8Z"
                fill="#1A1A1A"
              />
            </mask>
            <g mask="url(#mask0_2209_11748)">
              <rect
                width="194"
                height="31"
                rx="5"
                transform="matrix(-1 0 0 1 252 9)"
                fill="url(#paint0_linear_2209_11748)"
              />
            </g>
            <defs>
              <linearGradient
                id="paint0_linear_2209_11748"
                x1="0"
                y1="15.5"
                x2="194"
                y2="15.5"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#E130FC" stopOpacity="0.84" />
                <stop offset="1" stopColor="#1A1A1A" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div>
          <svg width="322" height="78" viewBox="0 0 322 78" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M115.385 4C105.394 4 96.8614 10.194 92.0266 18.166C88.5497 23.8991 83.7305 30.3132 77.7483 34.7998C65.0122 44.3518 46.8582 45.9889 27.594 44.5215C20.9504 43.4698 15.7107 44.301 11.7795 46.7939C7.79556 49.3205 5.7972 53.1451 4.84595 56.7217C3.90424 60.2625 3.90792 63.823 4.10571 66.3857C4.20638 67.69 4.36199 68.7917 4.49438 69.5771C4.56074 69.9708 4.6218 70.2885 4.66821 70.5156C4.69136 70.6289 4.71103 70.7199 4.72583 70.7871C4.73322 70.8206 4.7395 70.8487 4.74438 70.8701C4.7468 70.8807 4.74947 70.8899 4.75122 70.8975C4.7521 70.9013 4.75247 70.9052 4.75317 70.9082C4.75349 70.9096 4.75395 70.9113 4.75415 70.9121L8.64868 70L4.75513 70.916L5.48071 74H326.149V20C326.149 11.1635 318.985 4 310.149 4H115.385Z"
              fill="#1A1A1A"
              stroke="#121314"
              strokeWidth="8"
            />
            <mask
              id="mask0_2209_11749"
              style={{ maskType: 'alpha' }}
              maskUnits="userSpaceOnUse"
              x="8"
              y="8"
              width="315"
              height="62"
            >
              <path
                d="M322.149 8H115.385C107.109 8 99.738 13.1644 95.4467 20.2402C91.8437 26.1811 86.7101 33.079 80.1487 38C66.1487 48.5 46.6487 50 27.1487 48.5C2.64868 44.5 8.64868 69.9998 8.64868 69.9998H322.149V8Z"
                fill="#1A1A1A"
              />
            </mask>
            <g mask="url(#mask0_2209_11749)">
              <rect x="70.1487" y="9" width="194" height="31" rx="5" fill="url(#paint0_linear_2209_11749)" />
            </g>
            <defs>
              <linearGradient
                id="paint0_linear_2209_11749"
                x1="70.1487"
                y1="24.5"
                x2="264.149"
                y2="24.5"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#F7992B" />
                <stop offset="1" stopColor="#1A1A1A" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="w-full h-full absolute top-0 left-0 flex justify-between text-white/80 font-sans font-medium px-4 py-4">
          <div id="yes-position" className="flex gap-3">
            <button
              type="button"
              onClick={() => void takeProfit('YES', progressHint(profits.YES))}
              disabled={!canExitYes}
              aria-busy={isTakingProfit}
              aria-label={`${yesExit === 'TP' ? 'Take profit' : 'Stop loss'} on UP`}
              className="pointer-events-auto flex cursor-pointer gap-2 relative w-[40px] justify-center transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <figure className="absolute z-0 inset-0">
                <svg width="44" height="20" viewBox="0 0 44 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M0.492573 5.71949C-0.937171 3.15581 0.916258 0 3.85167 0H32.7363C34.1308 0 35.4161 0.754864 36.0954 1.97281L42.9593 14.2805C44.389 16.8442 42.5356 20 39.6002 20H10.7156C9.32102 20 8.03572 19.2451 7.35648 18.0272L0.492573 5.71949Z"
                    fill={exitColor(yesExit)}
                  />
                </svg>
              </figure>

              <span className="text-sm mt-0.5 ml-1 text-white z-10 font-medium1">{yesExit}</span>
            </button>

            <div className="tabular-nums mt-0.5">{positionLabel(yesPosition, 'UP')}</div>
          </div>

          <div id="no-position" className="flex gap-3">
            <div className="tabular-nums mt-0.5">{positionLabel(noPosition, 'DOWN')}</div>

            <button
              type="button"
              onClick={() => void takeProfit('NO', progressHint(profits.NO))}
              disabled={!canExitNo}
              aria-busy={isTakingProfit}
              aria-label={`${noExit === 'TP' ? 'Take profit' : 'Stop loss'} on DOWN`}
              className="pointer-events-auto flex cursor-pointer gap-3 relative w-[40px] justify-center transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <figure className="absolute z-0 inset-0">
                <svg width="44" height="20" viewBox="0 0 44 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M42.9593 5.71949C44.3891 3.15581 42.5356 0 39.6002 0H10.7156C9.32106 0 8.03576 0.754864 7.35652 1.97281L0.49261 14.2805C-0.937134 16.8442 0.916295 20 3.8517 20H32.7363C34.1309 20 35.4162 19.2451 36.0954 18.0272L42.9593 5.71949Z"
                    fill={exitColor(noExit)}
                  />
                </svg>
              </figure>

              <span className="text-sm mt-0.5 ml-1 text-white z-10 font-medium">{noExit}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex w-full h-full flex-1 justify-center relative z-30 bg-[#1a1a1a] rounded-2xl overflow-hidden">
        <div className="absolute w-1 h-1 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
          <div
            id="yes-panel"
            className="absolute top-0 h-[180px] w-[514px] flex justify-end left-[-620px] -translate-y-1/2 p-2 pointer-events-none"
          >
            <figure className="h-full">
              <svg
                className="h-full w-auto"
                width="393"
                height="156"
                viewBox="0 0 393 156"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M0.0183006 10.3692C-0.325012 4.70809 4.19475 0 9.86625 0H287.879C302.293 0 315.592 7.7554 322.691 20.3005L391.034 141.075C394.806 147.741 389.991 156 382.331 156H63.2945C47.922 156 33.8769 147.21 27.8285 133.077C21.1922 117.571 13.0708 96.9921 8.97974 80.5C3.51896 58.4863 1.00357 26.616 0.0183006 10.3692Z"
                  fill="url(#paint0_linear_2201_11639)"
                />
                <defs>
                  <linearGradient
                    id="paint0_linear_2201_11639"
                    x1="-0.520264"
                    y1="78"
                    x2="399.48"
                    y2="78"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#222222" stopOpacity="0" />
                    <stop offset="0.519231" stopColor="#222222" />
                  </linearGradient>
                </defs>
              </svg>
            </figure>
          </div>

          <div
            id="yes-panel-texture"
            className="absolute top-0 h-[180px] w-[514px] flex justify-end left-[-620px] -translate-y-1/2 p-2 pr-0 pointer-events-none"
          >
            <figure className="h-full">
              <Image
                draggable={false}
                src={upTexture}
                alt="up texture"
                width={393}
                height={180}
                className="h-full w-auto"
              />
            </figure>
          </div>

          <button
            type="button"
            id="yes-panel-text"
            onClick={() => void buy('YES')}
            disabled={!canTrade}
            aria-label="Buy UP"
            aria-busy={buyingYes}
            className="pointer-events-auto cursor-pointer absolute top-0 h-[180px] w-[514px] flex justify-start left-[-620px] -translate-y-1/2 p-2 pr-0 transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="absolute top-1/2 right-36 flex items-center text-white text-[40px] font-abc-gravity-italic -translate-y-1/2">
              {buyingYes ? <Spinner reduceMotion={reduceMotion} className="size-8" /> : <span>Up</span>}
            </div>
          </button>

          <div
            id="no-panel"
            className="absolute top-0 h-[180px] w-[514px] right-[-620px] -translate-y-1/2 p-2 pointer-events-none"
          >
            <figure className="h-full">
              <svg
                className="h-full w-auto"
                width="393"
                height="156"
                viewBox="0 0 393 156"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g clipPath="url(#clip0_2202_11698)">
                  <path
                    d="M392.327 10.3692C392.671 4.70809 388.151 0 382.479 0H104.467C90.0527 0 76.7532 7.7554 69.6543 20.3005L1.31145 141.075C-2.46081 147.741 2.35504 156 10.0147 156H329.051C344.424 156 358.469 147.21 364.517 133.077C371.153 117.571 379.275 96.9921 383.366 80.5C388.827 58.4863 391.342 26.616 392.327 10.3692Z"
                    fill="url(#paint0_linear_2202_11698)"
                  />
                </g>
                <defs>
                  <linearGradient
                    id="paint0_linear_2202_11698"
                    x1="0"
                    y1="78"
                    x2="392.345"
                    y2="78"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#222222" />
                    <stop offset="1" stopColor="#222222" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="clip0_2202_11698">
                    <rect width="393" height="156" fill="white" />
                  </clipPath>
                </defs>
              </svg>
            </figure>
          </div>

          <div
            id="no-panel-texture"
            className="absolute top-0 h-[180px] w-[514px] flex justify-start right-[-620px] -translate-y-1/2 p-2 pl-0 pointer-events-none"
          >
            <figure className="h-full">
              <Image
                draggable={false}
                src={downTexture}
                alt="down texture"
                width={393}
                height={180}
                className="h-full w-auto"
              />
            </figure>
          </div>

          <button
            type="button"
            id="no-panel-text"
            onClick={() => void buy('NO')}
            disabled={!canTrade}
            aria-label="Buy DOWN"
            aria-busy={buyingNo}
            className="pointer-events-auto cursor-pointer absolute top-0 h-[180px] w-[514px] flex justify-start right-[-620px] -translate-y-1/2 p-2 pl-0 transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="absolute top-1/2 left-36 flex items-center text-white text-[40px] font-abc-gravity-italic -translate-y-1/2">
              {buyingNo ? <Spinner reduceMotion={reduceMotion} className="size-8" /> : <span>Down</span>}
            </div>
          </button>
        </div>

        <div className="relative z-10 flex items-center flex-col w-[384px] pb-2">
          <div className="relative min-w-[384px] h-fit flex items-center justify-between gap-2">
            <button
              type="button"
              id="minus"
              onClick={() => bumpAmount(-TRADE_AMOUNT_STEP)}
              disabled={!canAdjustAmount || amount <= TRADE_AMOUNT_STEP}
              aria-label="Decrease trade amount"
              className="pointer-events-auto cursor-pointer relative transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-not-allowed z-10"
            >
              <figure className="z-10">
                <svg width="128" height="106" viewBox="0 0 128 106" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M68.5372 4C82.5094 4 95.0595 12.548 100.176 25.5498L122.733 82.874C126.347 92.0593 119.576 102 109.705 102H69.2628C57.005 102 45.6959 95.4014 39.6641 84.7305L5.83893 24.8887C0.563802 15.556 7.30598 4 18.0264 4H68.5372Z"
                    fill="#222222"
                    stroke="#1A1A1A"
                    strokeWidth="8"
                  />
                </svg>
              </figure>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-[32px] font-abc-gravity-italic z-10">
                -
              </div>
            </button>

            <div
              id="amount"
              className="absolute h-[86%] w-[65%] bg-[#222222] z-0 left-1/2 -translate-x-1/2 flex justify-center items-center overflow-hidden pointer-events-none"
            >
              <NumberFlow
                value={amount}
                animated={!reduceMotion}
                className="text-white text-[32px] font-abc-gravity-italic z-10"
              />

              <video
                className="absolute inset-0 size-full object-cover object-center motion-reduce:hidden opacity-30 z-0"
                src="https://v1.pinimg.com/videos/iht/expMp4/3e/06/12/3e06120f4326ec50e71392f95e0f4ff4_720w.mp4"
                autoPlay
                muted
                loop
                playsInline
                aria-hidden
              />
            </div>

            <button
              type="button"
              id="plus"
              onClick={() => bumpAmount(TRADE_AMOUNT_STEP)}
              disabled={!canAdjustAmount}
              aria-label="Increase trade amount"
              className="pointer-events-auto cursor-pointer relative transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-not-allowed z-10"
            >
              <figure className="z-10">
                <svg width="128" height="106" viewBox="0 0 128 106" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M59.1855 4C45.2133 4 32.6633 12.548 27.5469 25.5498L4.98926 82.874C1.37524 92.0593 8.14682 102 18.0176 102H58.46C70.7177 102 82.0268 95.4014 88.0586 84.7305L121.884 24.8887C127.159 15.556 120.417 4 109.696 4H59.1855Z"
                    fill="#222222"
                    stroke="#1A1A1A"
                    strokeWidth="8"
                  />
                </svg>
              </figure>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-[32px] font-abc-gravity-italic z-10">
                +
              </div>
            </button>
          </div>

          <div id="pnl" className="h-full relative">
            <figure className="z-10 h-full">
              <svg
                className="h-full w-auto"
                width="224"
                height="58"
                viewBox="0 0 224 58"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M91.2256 0H10.0151C2.28769 0 -2.51977 8.39075 1.38815 15.0572L23.664 53.0572C25.4588 56.1189 28.742 58 32.291 58L91.2256 58H151.893L191.5 58C195.049 58 198.332 56.1189 200.127 53.0572L222.403 15.0572C226.311 8.39075 221.503 0 213.776 0H151.893H91.2256Z"
                  fill="#222222"
                />
              </svg>
            </figure>

            <div
              className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-baseline text-[20px] font-semibold tabular-nums pointer-events-none"
              style={{
                color: floatingProfit > 0 ? PROFIT_COLOR : floatingProfit < 0 ? LOSS_COLOR : 'rgba(255,255,255,0.8)',
              }}
            >
              {floatingProfit >= 0 ? '+$' : '-$'}
              <NumberFlow
                value={Math.abs(floatingProfit)}
                animated={!reduceMotion}
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                className="text-[20px]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 z-30 flex items-end gap-3 p-2">
        <button
          type="button"
          onClick={onBack}
          className="pointer-events-auto cursor-pointer text-white text-[14px] font-sans py-2 px-3 rounded-lg bg-[#222222] transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97]"
        >
          Back
        </button>
        <p className={`max-w-[220px] truncate pb-2 font-sans text-[11px] ${statusTone}`} aria-live="polite">
          {detail}
        </p>
      </div>
    </div>
  )
}
