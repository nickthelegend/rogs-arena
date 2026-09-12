import { marketTradeAction, marketTradeOutcome, type MarketTrade } from '@/lib/market-trades'
import { closePositionKey, type MarketClose } from '@/lib/market-closes'
import { formatAddress, formatCents, formatShares } from '@/lib/format'
import { liveTraderHeartRate, traderKey, type Trader } from '@/lib/traders'
import { getAvatar, getFrame } from '@/lib/avatar'

const closedShares = 1e-8
export const LEADERBOARD_LIMIT = 10

export type LeaderboardSide = 'up' | 'down'
export type LeaderboardExit = 'tp' | 'sl'
export type LeaderboardStatus = 'open' | 'closed'

export type LeaderboardPrices = {
  yes?: number
  no?: number
}

export type LeaderboardItem = {
  id: string
  trader: string
  name: string
  avatar: string
  frame: string
  outcome: 'YES' | 'NO'
  side: LeaderboardSide
  shares: number
  avgPrice: number
  profit: number
  status: LeaderboardStatus
  exit?: LeaderboardExit
  heartRate?: number
}

type OpenPosition = {
  trader: string
  displayTrader: string
  outcome: 'YES' | 'NO'
  shares: number
  cost: number
  openedShares: number
  realized: number
}

type ClosedLot = {
  trader: string
  displayTrader: string
  outcome: 'YES' | 'NO'
  shares: number
  avgPrice: number
  profit: number
}

function tradeSize(trade: MarketTrade) {
  if (Number.isFinite(trade.amount) && (trade.amount ?? 0) > 0) return trade.amount as number

  const cost = trade.cost
  const price = trade.price
  if (Number.isFinite(cost) && Number.isFinite(price) && (price ?? 0) > 0) {
    return (cost as number) / (price as number)
  }

  return null
}

function tradeCost(trade: MarketTrade, amount: number) {
  if (Number.isFinite(trade.cost) && (trade.cost ?? 0) >= 0) return trade.cost as number
  if (Number.isFinite(trade.price)) return amount * (trade.price as number)
  return null
}

function positionKey(trader: string, outcome: 'YES' | 'NO') {
  return `${trader}:${outcome}`
}

function tradePrice(trade: MarketTrade, amount: number) {
  if (Number.isFinite(trade.price)) return trade.price as number
  if (Number.isFinite(trade.cost) && amount > 0) return (trade.cost as number) / amount
  return null
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100
}

function applyBuy(position: OpenPosition | undefined, trade: MarketTrade, trader: string, outcome: 'YES' | 'NO') {
  const amount = tradeSize(trade)
  if (amount == null) return position

  const cost = tradeCost(trade, amount)
  if (cost == null) return position

  const current = position ?? {
    trader,
    displayTrader: trade.taker ?? trader,
    outcome,
    shares: 0,
    cost: 0,
    openedShares: 0,
    realized: 0,
  }

  return {
    ...current,
    displayTrader: current.shares > closedShares ? current.displayTrader : (trade.taker ?? current.displayTrader),
    shares: current.shares + amount,
    cost: current.cost + cost,
    openedShares: current.openedShares + amount,
  }
}

function applySell(
  position: OpenPosition | undefined,
  trade: MarketTrade,
): { open?: OpenPosition; closed?: ClosedLot } {
  if (!position || position.shares <= closedShares) return { open: position }

  const amount = tradeSize(trade)
  if (amount == null) return { open: position }

  const sold = Math.min(amount, position.shares)
  const avgPrice = position.cost / position.shares
  const price = tradePrice(trade, amount) ?? avgPrice
  const realized = position.realized + (price - avgPrice) * sold
  const nextShares = position.shares - sold

  if (nextShares <= closedShares) {
    return {
      closed: {
        trader: position.trader,
        displayTrader: position.displayTrader,
        outcome: position.outcome,
        shares: position.openedShares > closedShares ? position.openedShares : position.shares,
        avgPrice,
        profit: roundCents(realized),
      },
    }
  }

  return {
    open: {
      ...position,
      shares: nextShares,
      cost: position.cost - avgPrice * sold,
      realized,
    },
  }
}

function markPrice(outcome: 'YES' | 'NO', prices: LeaderboardPrices) {
  return outcome === 'YES' ? prices.yes : prices.no
}

function exitFromProfit(profit: number): LeaderboardExit {
  return profit >= 0 ? 'tp' : 'sl'
}

function toOpenItem(position: OpenPosition, prices: LeaderboardPrices): LeaderboardItem | null {
  if (position.shares <= closedShares) return null

  const avgPrice = position.cost / position.shares
  if (!Number.isFinite(avgPrice)) return null

  const mark = markPrice(position.outcome, prices)
  const rawProfit = mark == null ? 0 : (mark - avgPrice) * position.shares
  const profit = roundCents(rawProfit)

  return {
    id: positionKey(position.trader, position.outcome),
    trader: position.trader,
    name: formatAddress(position.displayTrader),
    avatar: getAvatar(position.displayTrader),
    frame: getFrame(position.displayTrader),
    outcome: position.outcome,
    side: position.outcome === 'YES' ? 'up' : 'down',
    shares: position.shares,
    avgPrice,
    profit,
    status: 'open',
  }
}

function toClosedItem(lot: ClosedLot): LeaderboardItem | null {
  if (!Number.isFinite(lot.avgPrice) || lot.shares <= closedShares) return null

  return {
    id: `${positionKey(lot.trader, lot.outcome)}:done`,
    trader: lot.trader,
    name: formatAddress(lot.displayTrader),
    avatar: getAvatar(lot.displayTrader),
    frame: getFrame(lot.displayTrader),
    outcome: lot.outcome,
    side: lot.outcome === 'YES' ? 'up' : 'down',
    shares: lot.shares,
    avgPrice: lot.avgPrice,
    profit: lot.profit,
    status: 'closed',
    exit: exitFromProfit(lot.profit),
  }
}

function compareByPnl(left: LeaderboardItem, right: LeaderboardItem) {
  return right.profit - left.profit || right.shares - left.shares || left.id.localeCompare(right.id)
}

function rankByPnl(items: LeaderboardItem[], limit = items.length) {
  return items.sort(compareByPnl).slice(0, limit)
}

export function toLeaderboardItems(
  trades: MarketTrade[],
  prices: LeaderboardPrices,
  limit = LEADERBOARD_LIMIT,
): LeaderboardItem[] {
  const open = new Map<string, OpenPosition>()
  const closed = new Map<string, ClosedLot>()
  const ordered = [...trades].sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))

  for (const trade of ordered) {
    const trader = trade.taker?.toLowerCase()
    const outcome = marketTradeOutcome(trade)
    if (!trader || !outcome) continue

    const key = positionKey(trader, outcome)
    const action = marketTradeAction(trade) ?? 'buy'

    if (action === 'buy') {
      const next = applyBuy(open.get(key), trade, trader, outcome)
      if (next) open.set(key, next)
      continue
    }

    const { open: nextOpen, closed: nextClosed } = applySell(open.get(key), trade)
    if (nextOpen) open.set(key, nextOpen)
    else open.delete(key)
    if (nextClosed) closed.set(key, nextClosed)
  }

  return rankByPnl(
    [
      ...[...open.values()].flatMap((position) => {
        const item = toOpenItem(position, prices)
        return item ? [item] : []
      }),
      ...[...closed.values()].flatMap((lot) => {
        const item = toClosedItem(lot)
        return item ? [item] : []
      }),
    ],
    limit,
  )
}

export function floatingProfitsForTrader(
  trades: MarketTrade[],
  prices: LeaderboardPrices,
  address?: string | null,
) {
  const profits = { YES: 0, NO: 0 }

  if (!address) return profits

  const trader = address.toLowerCase()
  for (const item of toLeaderboardItems(trades, prices, Number.POSITIVE_INFINITY)) {
    if (item.status !== 'open' || item.trader !== trader) continue
    profits[item.outcome] += item.profit
  }

  return profits
}

export function floatingProfitForTrader(
  trades: MarketTrade[],
  prices: LeaderboardPrices,
  address?: string | null,
) {
  const profits = floatingProfitsForTrader(trades, prices, address)
  return profits.YES + profits.NO
}

export function withCloseExits(items: LeaderboardItem[], closes: readonly MarketClose[]): LeaderboardItem[] {
  if (items.length === 0 || closes.length === 0) return items

  const byKey = new Map<string, MarketClose>()
  for (const close of closes) {
    byKey.set(closePositionKey(close.trader, close.outcome), close)
  }

  let changed = false
  const next = items.map((item) => {
    if (item.status !== 'closed') return item
    const close = byKey.get(closePositionKey(item.trader, item.outcome))
    if (!close || (close.exit === item.exit && close.profit === item.profit)) return item

    changed = true
    return { ...item, exit: close.exit, profit: close.profit }
  })

  return changed ? rankByPnl(next) : items
}

export function withTraderData(items: LeaderboardItem[], traders: readonly Trader[], now = Date.now()): LeaderboardItem[] {
  if (items.length === 0 || traders.length === 0) return items

  const byKey = new Map<string, Trader>()
  for (const trader of traders) {
    byKey.set(traderKey(trader.address), trader)
  }

  let changed = false
  const next = items.map((item) => {
    const trader = byKey.get(traderKey(item.trader))
    if (!trader) return item

    const name = trader.name || item.name
    const heartRate = liveTraderHeartRate(trader, now)
    if (name === item.name && heartRate === item.heartRate) return item

    changed = true
    return { ...item, name, heartRate }
  })

  return changed ? next : items
}

export { formatCents, formatShares }

export const LEADERBOARD_FADE_S = 0.2
export const LEADERBOARD_STAGGER_S = 0.05

export type LeaderboardHold = {
  marketKey: string
  items: LeaderboardItem[]
  epoch: number
}

export function leaderboardStaggerDelay(index: number, reduceMotion: boolean) {
  return reduceMotion ? 0 : index * LEADERBOARD_STAGGER_S
}

export function leaderboardExitDuration(count: number, reduceMotion: boolean) {
  if (reduceMotion) return LEADERBOARD_FADE_S
  return LEADERBOARD_FADE_S + Math.max(0, count - 1) * LEADERBOARD_STAGGER_S
}

function reuseHold(
  current: LeaderboardHold | null,
  next: LeaderboardHold,
  frozen: boolean,
): { hold: LeaderboardHold; frozen: boolean } {
  if (
    current &&
    current.marketKey === next.marketKey &&
    current.epoch === next.epoch &&
    (current.items === next.items || (current.items.length === 0 && next.items.length === 0))
  ) {
    return { hold: current, frozen }
  }

  return { hold: next, frozen }
}

export function advanceLeaderboardHold(
  current: LeaderboardHold | null,
  marketKey: string,
  liveItems: LeaderboardItem[],
): { hold: LeaderboardHold; frozen: boolean } {
  if (liveItems.length > 0 && marketKey) {
    const handedOff = Boolean(current?.marketKey && current.marketKey !== marketKey && current.items.length > 0)
    return reuseHold(
      current,
      {
        marketKey,
        items: liveItems,
        epoch: (current?.epoch ?? 0) + (handedOff ? 1 : 0),
      },
      false,
    )
  }

  const betweenMarkets = !marketKey || Boolean(current && current.marketKey !== marketKey)
  if (betweenMarkets && current?.items.length) {
    return { hold: current, frozen: true }
  }

  return reuseHold(
    current,
    {
      marketKey,
      items: liveItems,
      epoch: current?.epoch ?? 0,
    },
    false,
  )
}
