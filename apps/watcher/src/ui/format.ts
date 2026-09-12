import type { DashboardMarket, DashboardMarketStatus, MarketValueSource, WatcherSnapshot } from '@/types'

export const yesColor = '#90B64F'
export const noColor = '#D6503C'
export const cream = '#F7E0B8'
export const muted = '#A89B7A'

export function formatPercent(value: number | undefined) {
  if (value === undefined) return '—'
  return `${(value * 100).toFixed(2)}%`
}

export function formatNumber(value: number | undefined) {
  if (value === undefined) return '—'
  return value.toLocaleString('en', { maximumFractionDigits: 2 })
}

export function formatClock(timestamp: number | undefined) {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '—'
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

export function formatCountdown(targetSeconds: number | undefined, now: number) {
  if (targetSeconds === undefined) return undefined
  const remaining = Math.max(0, targetSeconds * 1000 - now)
  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalSeconds <= 0) return '0s'
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export function formatRemaining(expirySeconds: number | undefined, now: number) {
  const countdown = formatCountdown(expirySeconds, now)
  if (countdown === undefined) return undefined
  if (countdown === '0s') return 'expired · switching'
  return `${countdown} left`
}

export function formatMarketTiming(market: DashboardMarket, now: number) {
  if (market.status === 'live') {
    const countdown = formatCountdown(market.expirySeconds, now)
    return countdown ? `${countdown} left` : '—'
  }
  if (market.status === 'upcoming') {
    const countdown = formatCountdown(market.tradingStartSeconds, now)
    return countdown ? `in ${countdown}` : '—'
  }
  if (market.status === 'expired') return 'ended'
  return 'off'
}

export function marketStatusLabel(status: DashboardMarketStatus) {
  if (status === 'live') return 'LIVE'
  if (status === 'upcoming') return 'NEXT'
  if (status === 'expired') return 'DONE'
  return 'OFF'
}

export function marketStatusColor(status: DashboardMarketStatus) {
  if (status === 'live') return yesColor
  if (status === 'upcoming') return '#E4B04A'
  return muted
}

export function formatRetry(retryAt: number | undefined, now: number) {
  if (retryAt === undefined) return undefined
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))
  return remaining === 0 ? 'retrying' : `retry in ${remaining}s`
}

export function formatSource(source: MarketValueSource | undefined) {
  if (source === 'last_price') return 'last price'
  return source ?? '—'
}

export function formatSide(side: string | undefined) {
  if (!side) return '—'
  return side.replaceAll('_', ' ')
}

export function sideColor(side: string | undefined) {
  if (!side) return muted
  if (side.includes('YES')) return yesColor
  if (side.includes('NO')) return noColor
  return cream
}

export function phaseColor(phase: WatcherSnapshot['phase']) {
  if (phase === 'watching') return yesColor
  if (phase === 'error') return noColor
  return '#E4B04A'
}

export function phaseLabel(phase: WatcherSnapshot['phase']) {
  if (phase === 'watching') return 'LIVE'
  if (phase === 'waiting') return 'WAIT'
  if (phase === 'error') return 'ERR'
  return 'SYNC'
}
