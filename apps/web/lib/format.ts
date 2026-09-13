export type PriceFeedStatus = 'waiting' | 'hydrating' | 'live' | 'error'

/** Base58 addresses are case-sensitive: first 4 + '…' + last 4, never lowercased. */
export function formatAddress(address: string) {
  if (address.length <= 9) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export const usdFormatter = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 4,
})

const priceFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 6,
})

const clockFormatter = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// No timeZone option: these format in the viewer's own local time zone.
const localTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const localHmFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const localZoneFormatter = new Intl.DateTimeFormat('en-US', {
  timeZoneName: 'short',
})

export function formatUsd(value?: number) {
  if (value === undefined) return '--'

  return usdFormatter.format(value)
}

export function formatPercent(value?: number) {
  if (value === undefined) return '--'

  return `${(value * 100).toFixed(1)}%`
}

export function formatChange(value?: number, percent?: number) {
  if (value === undefined || percent === undefined) return '--'

  const sign = value >= 0 ? '+' : ''

  return `${sign}${formatUsd(value)} (${sign}${(percent * 100).toFixed(2)}%)`
}

export function formatNumber(value?: number) {
  if (value === undefined) return '--'

  return numberFormatter.format(value)
}

export function formatPrice(value?: number) {
  if (value === undefined) return '--'

  return priceFormatter.format(value)
}

export function formatChartTime(seconds: number) {
  return clockFormatter.format(new Date(seconds * 1000))
}

export function formatUpdateTime(value?: number) {
  if (value === undefined) return 'Waiting'

  return clockFormatter.format(new Date(value))
}

export function formatLocalHm(value: number) {
  if (!Number.isFinite(value)) return ''
  return localHmFormatter.format(new Date(value))
}

export function formatLocalTime(value: number = Date.now()) {
  const date = new Date(value)
  const time = localTimeFormatter.format(date)
  const zone = localZoneFormatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value
  return zone ? `${time} ${zone}` : time
}

export function formatDate(value: Date | number | string) {
  return dateTimeFormatter.format(new Date(value))
}

export function formatDateTime(seconds: string) {
  return formatDate(Number(seconds) * 1000)
}

export function formatDecimalAmount(value: string | undefined, maxFractionDigits = 4) {
  if (!value) return '0'

  const [whole, fraction = ''] = value.split('.')
  const trimmedFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, '')
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole
}

export function formatShares(shares: number) {
  if (Math.abs(shares - Math.round(shares)) < 0.05) return String(Math.round(shares))
  return shares.toFixed(1)
}

export function formatCents(price: number) {
  return `${(price * 100).toFixed(1)}¢`
}

export function priceStatusLabel(status: PriceFeedStatus, lastUpdateMs?: number) {
  if (status === 'live') return `Live ${formatUpdateTime(lastUpdateMs)}`
  if (status === 'hydrating') return 'Syncing'
  if (status === 'error') return 'Feed error'
  return 'Waiting'
}

const marketPriceFormatters = new Map<number, Intl.NumberFormat>()

function marketPriceFormatter(decimals: number) {
  const digits = Math.min(Math.max(Math.round(decimals), 0), 8)
  let formatter = marketPriceFormatters.get(digits)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    marketPriceFormatters.set(digits, formatter)
  }
  return formatter
}

/** A coin's USD price with that market's decimals: $77,197.85 for BTC, $0.08464 for DOGE. */
export function formatMarketPrice(value: number | undefined, decimals: number) {
  if (value === undefined || !Number.isFinite(value)) return '--'
  return marketPriceFormatter(decimals).format(value)
}

export function formatMarketChange(value: number | undefined, percent: number | undefined, decimals: number) {
  if (value === undefined || percent === undefined) return '--'

  const sign = value >= 0 ? '+' : ''

  return `${sign}${formatMarketPrice(value, decimals)} (${sign}${(percent * 100).toFixed(2)}%)`
}
