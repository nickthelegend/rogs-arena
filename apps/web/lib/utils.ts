import type { CandlePoint, LivelinePoint } from '@/lib/liveline'
import { BTC_PRICE_TICKS } from '@/lib/btc'
import type { PricePoint, LivePrice } from '@somnia-chain/markets-sdk'

export {
  formatAddress,
  formatChange,
  formatChartTime,
  formatGmt7Time,
  formatPercent,
  formatUpdateTime,
  formatUsd,
  priceStatusLabel,
  usdFormatter,
} from '@/lib/format'

export const DISPLAY_NAME_MAX_LENGTH = 15

export function sanitizeName(name: string) {
  return name.toLowerCase().replace(/\s/g, '').slice(0, DISPLAY_NAME_MAX_LENGTH)
}

export function normalizePoints(points: LivelinePoint[]) {
  return points
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time)
    .filter((point, index, sorted) => index === sorted.length - 1 || point.time !== sorted[index + 1]?.time)
}

/**
 * Liveline only keeps points inside `[leftEdge - 2s, now]`.
 * Watcher samples are last-value (no write while YES/NO is unchanged), so a 1m
 * window often has no point near the left edge — the stroke starts mid-chart
 * and then “continues”. Hold the last known value on a 1s grid through `now`.
 */
export function holdLastValue(
  points: LivelinePoint[],
  nowSeconds: number,
  stepSeconds = 1,
  fromTime?: number,
): LivelinePoint[] {
  const sorted = normalizePoints(points)
  if (sorted.length === 0 || nowSeconds === 0) return sorted

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return sorted

  const start = fromTime != null && Number.isFinite(fromTime) && fromTime < first.time ? fromTime : first.time
  const end = Math.max(nowSeconds, last.time)
  const held: LivelinePoint[] = []
  let index = 0
  let value = first.value

  for (let time = start; time < end; time += stepSeconds) {
    while (index + 1 < sorted.length && (sorted[index + 1]?.time ?? Number.POSITIVE_INFINITY) <= time) {
      index += 1
      value = sorted[index]?.value ?? value
    }
    held.push({ time, value })
  }

  held.push(...sorted)
  held.push({ time: end, value: last.value })

  return normalizePoints(held)
}

export function ensureDrawablePoints(points: LivelinePoint[], fallbackValue: number | undefined, nowSeconds: number) {
  if (points.length >= 2) return points

  const value = points.at(-1)?.value ?? fallbackValue
  if (value === undefined || nowSeconds === 0) return points

  const firstTime = points.at(-1)?.time ?? nowSeconds
  return normalizePoints([
    { time: firstTime - 1, value },
    { time: firstTime, value },
  ])
}

export function tickToLivelinePoint(tick: PricePoint): LivelinePoint {
  return {
    time: Math.floor(tick.blockTimestamp),
    value: tick.price,
  }
}

export function livePriceToPoint(price: LivePrice): LivelinePoint {
  return {
    time: Math.floor(price.blockTimestamp),
    value: price.price,
  }
}

export function normalizePricePoints(points: LivelinePoint[]) {
  return points
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((left, right) => left.time - right.time)
    .filter((point, index, sorted) => index === sorted.length - 1 || point.time !== sorted[index + 1].time)
    .slice(-BTC_PRICE_TICKS)
}

export function candleWidthForWindow(windowSecs: number) {
  if (windowSecs <= 60) return 2
  if (windowSecs <= 300) return 5
  if (windowSecs <= 900) return 15
  return 60
}

export function pointsToCandles(points: LivelinePoint[], candleWidth: number) {
  const buckets = new Map<number, CandlePoint>()

  for (const point of points) {
    const openTime = Math.floor(point.time / candleWidth) * candleWidth
    const existing = buckets.get(openTime)

    if (!existing) {
      buckets.set(openTime, {
        time: openTime,
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
      })
      continue
    }

    existing.high = Math.max(existing.high, point.value)
    existing.low = Math.min(existing.low, point.value)
    existing.close = point.value
  }

  const candles = [...buckets.values()].sort((left, right) => left.time - right.time)
  const liveCandle = candles.at(-1)

  return {
    candles: candles.slice(0, -1),
    liveCandle,
  }
}

export { getAvatar, getFrame } from '@/lib/avatar'
