import type { WindowOption } from '@/lib/liveline/types'

export const PRICE_WINDOWS: WindowOption[] = [
  { label: '1m', secs: 60 },
  { label: '5m', secs: 5 * 60 },
  { label: '15m', secs: 15 * 60 },
  { label: '1h', secs: 60 * 60 },
]

/** How far back the stored history loaded on open and on a coin switch reaches: the largest window. */
export const PRICE_HISTORY_SECS = Math.max(...PRICE_WINDOWS.map((option) => option.secs))

/** Oracle points kept per coin. Points are one per second at most (a feed's publish time), so this spans that window. */
export const PRICE_TICKS = PRICE_HISTORY_SECS
