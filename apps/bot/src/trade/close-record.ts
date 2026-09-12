import type { ExitReason, Outcome } from './types'

export type PositionClose = {
  marketId: string
  trader: string
  outcome: Outcome
  exit: ExitReason
  profit: number
  shares: number
  t: number
}

export function closeRecord(input: PositionClose): PositionClose {
  return {
    marketId: input.marketId,
    trader: input.trader.toLowerCase(),
    outcome: input.outcome,
    exit: input.exit,
    profit: Math.round(input.profit * 100) / 100,
    shares: input.shares,
    t: input.t,
  }
}
