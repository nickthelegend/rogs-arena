import { CLOSES_PATH } from '@repo/shared/firebase-path'

export { CLOSES_PATH, closeKey } from '@repo/shared/firebase-path'

export type CloseExit = 'tp' | 'sl'

export type MarketClose = {
  id: string
  marketId: string
  trader: string
  outcome: 'YES' | 'NO'
  exit: CloseExit
  profit: number
  shares: number
  t: number
}

export function isCloseExit(value: unknown): value is CloseExit {
  return value === 'tp' || value === 'sl'
}

export function isMarketClose(id: string, value: unknown): value is Omit<MarketClose, 'id'> {
  if (!id || !value || typeof value !== 'object') return false

  const close = value as MarketClose
  return (
    typeof close.marketId === 'string' &&
    close.marketId.length > 0 &&
    typeof close.trader === 'string' &&
    close.trader.length > 0 &&
    (close.outcome === 'YES' || close.outcome === 'NO') &&
    isCloseExit(close.exit) &&
    Number.isFinite(close.profit) &&
    Number.isFinite(close.shares) &&
    Number.isFinite(close.t)
  )
}

export function closePositionKey(trader: string, outcome: 'YES' | 'NO') {
  return `${trader.toLowerCase()}:${outcome}`
}
