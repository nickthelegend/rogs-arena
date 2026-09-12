import type { WindowOption } from '@/lib/liveline/types'

export const BTC_ASSET = 'BTC'
export const BTC_COLOR = '#F7931A'
export const BTC_PRICE_TICKS = 1_000

export const BTC_PRICE_WINDOWS: WindowOption[] = [
  { label: '1m', secs: 60 },
  { label: '5m', secs: 5 * 60 },
  { label: '15m', secs: 15 * 60 },
  { label: '1h', secs: 60 * 60 },
]
