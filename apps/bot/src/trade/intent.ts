import {
  defaultCostBounds,
  resolveCostBounds,
  sellChance,
  stickiness,
  stopLossRate,
  takeProfitRate,
  type BookPrices,
  type CostBounds,
  type ExitReason,
  type Outcome,
  type TradeAction,
  type TradeIntent,
  type TradeSide,
  type WalletPositions,
} from './types'

export function oppositeOutcome(outcome: Outcome): Outcome {
  return outcome === 'YES' ? 'NO' : 'YES'
}

export function tradeSide(outcome: Outcome, action: TradeAction): TradeSide {
  if (action === 'buy') return outcome === 'YES' ? 'BUY_YES' : 'BUY_NO'
  return outcome === 'YES' ? 'SELL_YES' : 'SELL_NO'
}

export function walletBias(address: string): Outcome {
  const nibble = Number.parseInt(address.slice(-1), 16)
  if (!Number.isFinite(nibble)) return 'YES'
  return nibble % 2 === 0 ? 'YES' : 'NO'
}

export function pickCost(budget: number, random = Math.random, bounds: CostBounds = defaultCostBounds) {
  const { min, limit } = bounds
  const ceiling = Math.min(budget, limit)
  if (!(ceiling > min)) return null
  const cost = min + random() * (ceiling - min)
  return cost > min ? Math.min(cost, limit) : Math.min(ceiling, min + 0.01)
}

function outcomeBid(outcome: Outcome, prices: BookPrices) {
  return outcome === 'YES' ? prices.yesBid : prices.noBid
}

function outcomePosition(outcome: Outcome, positions: WalletPositions) {
  return outcome === 'YES' ? positions.yes : positions.no
}

function sellableValue(outcome: Outcome, positions: WalletPositions, prices: BookPrices) {
  const bid = outcomeBid(outcome, prices)
  if (bid === undefined || bid <= 0) return 0
  return outcomePosition(outcome, positions) * bid
}

export function allocatedPnl(outcome: Outcome, positions: WalletPositions, prices: BookPrices) {
  if (positions.unrealizedPnl == null || !Number.isFinite(positions.unrealizedPnl)) return null

  const yesValue = sellableValue('YES', positions, prices)
  const noValue = sellableValue('NO', positions, prices)
  const total = yesValue + noValue
  if (!(total > 0)) return null

  const mark = outcome === 'YES' ? yesValue : noValue
  return positions.unrealizedPnl * (mark / total)
}

export function exitReason(pnl: number, mark: number): ExitReason | null {
  if (!(mark > 0) || !Number.isFinite(pnl)) return null
  const rate = pnl / mark
  if (rate >= takeProfitRate) return 'tp'
  if (rate <= -stopLossRate) return 'sl'
  return null
}

export function pickExitIntent(
  positions: WalletPositions,
  prices: BookPrices,
): TradeIntent | null {
  for (const outcome of ['YES', 'NO'] as const) {
    const mark = sellableValue(outcome, positions, prices)
    const pnl = allocatedPnl(outcome, positions, prices)
    if (pnl == null) continue

    const exit = exitReason(pnl, mark)
    if (!exit) continue

    return {
      side: tradeSide(outcome, 'sell'),
      outcome,
      action: 'sell',
      cost: mark,
      exit,
    }
  }

  return null
}

export function pickIntent(
  address: string,
  positions: WalletPositions,
  prices: BookPrices,
  random = Math.random,
  bounds: Partial<CostBounds> = {},
): TradeIntent | null {
  const costBounds = resolveCostBounds(bounds)
  const exit = pickExitIntent(positions, prices)
  if (exit) return exit

  const preferred = walletBias(address)
  const outcome = random() < stickiness ? preferred : oppositeOutcome(preferred)
  const sellValue = sellableValue(outcome, positions, prices)
  const canSell = sellValue > costBounds.min
  const action: TradeAction = canSell && random() < sellChance ? 'sell' : 'buy'
  const budget = action === 'sell' ? sellValue : positions.collateral
  const cost = pickCost(budget, random, costBounds)
  if (cost === null) return null

  return {
    side: tradeSide(outcome, action),
    outcome,
    action,
    cost,
  }
}
