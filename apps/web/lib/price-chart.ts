import type { WindowOption } from '@/lib/liveline/types'

/** Oracle ticks kept for the price chart; its history starts when the page opens. */
export const PRICE_TICKS = 1_000

export const PRICE_WINDOWS: WindowOption[] = [
  { label: '1m', secs: 60 },
  { label: '5m', secs: 5 * 60 },
  { label: '15m', secs: 15 * 60 },
  { label: '1h', secs: 60 * 60 },
]
