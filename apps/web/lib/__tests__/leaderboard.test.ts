import { describe, expect, test } from 'bun:test'
import {
  advanceLeaderboardHold,
  floatingProfitForTrader,
  floatingProfitsForTrader,
  formatCents,
  formatShares,
  LEADERBOARD_LIMIT,
  toLeaderboardItems,
  withCloseExits,
  withTraderData,
  type LeaderboardHold,
  type LeaderboardItem,
} from '../leaderboard'
import type { MarketTrade } from '../market-trades'
import type { Trader } from '../traders'

function trade(overrides: Partial<MarketTrade> = {}): MarketTrade {
  return {
    id: '1',
    t: 1,
    taker: '0x1111111111111111111111111111111111111111',
    outcome: 'YES',
    side: 'BUY_YES',
    amount: 100,
    price: 0.4,
    cost: 40,
    ...overrides,
  }
}

function byId(items: LeaderboardItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

describe('toLeaderboardItems', () => {
  test('averages same-direction fills as one DCA position', () => {
    const items = toLeaderboardItems(
      [
        trade({ id: 'a', t: 1, amount: 100, price: 0.4, cost: 40 }),
        trade({ id: 'b', t: 2, amount: 100, price: 0.6, cost: 60 }),
      ],
      { yes: 0.7 },
    )

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      shares: 200,
      avgPrice: 0.5,
      side: 'up',
      profit: 40,
    })
  })

  test('splits YES and NO for the same trader into two rows', () => {
    const items = toLeaderboardItems(
      [
        trade({ id: 'yes', outcome: 'YES', side: 'BUY_YES', amount: 50, price: 0.4, cost: 20 }),
        trade({
          id: 'no',
          t: 2,
          outcome: 'NO',
          side: 'BUY_NO',
          amount: 80,
          price: 0.3,
          cost: 24,
        }),
      ],
      { yes: 0.55, no: 0.45 },
    )

    expect(items.map((item) => item.side).sort()).toEqual(['down', 'up'])
    expect(items).toHaveLength(2)
  })

  test('sells reduce the DCA stack and keep the average', () => {
    const [item] = toLeaderboardItems(
      [
        trade({ id: 'buy-1', t: 1, amount: 100, price: 0.4, cost: 40 }),
        trade({ id: 'buy-2', t: 2, amount: 100, price: 0.6, cost: 60 }),
        trade({ id: 'sell', t: 3, side: 'SELL_YES', amount: 50, price: 0.8, cost: 40 }),
      ],
      { yes: 0.7 },
    )

    expect(item?.shares).toBe(150)
    expect(item?.avgPrice).toBeCloseTo(0.5)
    expect(item?.profit).toBeCloseTo(30)
  })

  test('keeps a fully sold lot on the board with a TP badge', () => {
    const items = toLeaderboardItems(
      [
        trade({ id: 'buy', t: 1, amount: 40, price: 0.25, cost: 10 }),
        trade({ id: 'sell', t: 2, side: 'SELL_YES', amount: 40, price: 0.4, cost: 16 }),
      ],
      { yes: 0.5 },
    )

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      status: 'closed',
      exit: 'tp',
      shares: 40,
      avgPrice: 0.25,
      profit: 6,
    })
  })

  test('marks a losing close as SL and ranks it below a profitable open', () => {
    const items = toLeaderboardItems(
      [
        trade({
          id: 'closed-buy',
          t: 1,
          taker: '0x2222222222222222222222222222222222222222',
          amount: 100,
          price: 0.8,
          cost: 80,
        }),
        trade({
          id: 'closed-sell',
          t: 2,
          taker: '0x2222222222222222222222222222222222222222',
          side: 'SELL_YES',
          amount: 100,
          price: 0.5,
          cost: 50,
        }),
        trade({ id: 'open', t: 3, amount: 50, price: 0.4, cost: 20 }),
      ],
      { yes: 0.5 },
    )

    expect(items.map((item) => item.status)).toEqual(['open', 'closed'])
    expect(items[1]).toMatchObject({
      trader: '0x2222222222222222222222222222222222222222',
      exit: 'sl',
      profit: -30,
    })
  })

  test('sorts by profit, highest first, including closed TP and SL lots', () => {
    const items = toLeaderboardItems(
      [
        trade({
          id: 'loser',
          t: 1,
          taker: '0x2222222222222222222222222222222222222222',
          amount: 100,
          price: 0.8,
          cost: 80,
        }),
        trade({
          id: 'winner',
          t: 2,
          taker: '0x3333333333333333333333333333333333333333',
          amount: 100,
          price: 0.2,
          cost: 20,
        }),
        trade({
          id: 'closed-buy',
          t: 3,
          taker: '0x4444444444444444444444444444444444444444',
          amount: 100,
          price: 0.2,
          cost: 20,
        }),
        trade({
          id: 'closed-sell',
          t: 4,
          taker: '0x4444444444444444444444444444444444444444',
          side: 'SELL_YES',
          amount: 100,
          price: 0.9,
          cost: 90,
        }),
      ],
      { yes: 0.5 },
    )

    expect(items.map((item) => item.trader)).toEqual([
      '0x4444444444444444444444444444444444444444',
      '0x3333333333333333333333333333333333333333',
      '0x2222222222222222222222222222222222222222',
    ])
    expect(items[0]).toMatchObject({ status: 'closed', exit: 'tp', profit: 70 })
    expect(items[1]).toMatchObject({ status: 'open', profit: 30 })
    expect(items[2]).toMatchObject({ status: 'open', profit: -30 })
  })

  test('keeps only the top ten rows', () => {
    const trades = Array.from({ length: LEADERBOARD_LIMIT + 2 }, (_, index) =>
      trade({
        id: `t${index}`,
        t: index + 1,
        taker: `0x${index.toString(16).padStart(40, '0')}`,
        amount: 100,
        price: 0.2 + index * 0.01,
        cost: 20 + index,
      }),
    )

    const items = toLeaderboardItems(trades, { yes: 0.5 })
    expect(items).toHaveLength(LEADERBOARD_LIMIT)
    expect(items[0]?.profit).toBeGreaterThan(items[items.length - 1]?.profit ?? 0)
  })

  test('lets a closed TP displace a weaker open when the board is full', () => {
    const opens = Array.from({ length: LEADERBOARD_LIMIT }, (_, index) =>
      trade({
        id: `open-${index}`,
        t: index + 1,
        taker: `0x${(index + 1).toString(16).padStart(40, '0')}`,
        amount: 100,
        price: 0.49,
        cost: 49,
      }),
    )

    const items = toLeaderboardItems(
      [
        ...opens,
        trade({
          id: 'closed-buy',
          t: 20,
          taker: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          amount: 100,
          price: 0.2,
          cost: 20,
        }),
        trade({
          id: 'closed-sell',
          t: 21,
          taker: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          side: 'SELL_YES',
          amount: 100,
          price: 0.8,
          cost: 80,
        }),
      ],
      { yes: 0.5 },
    )

    expect(items).toHaveLength(LEADERBOARD_LIMIT)
    expect(items[0]).toMatchObject({
      trader: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'closed',
      exit: 'tp',
      profit: 60,
    })
  })

  test('ignores fills without a taker or outcome', () => {
    const items = toLeaderboardItems(
      [trade({ taker: null }), trade({ outcome: null, side: null, kind: null }), trade({ id: 'kept' })],
      { yes: 0.5 },
    )

    expect(Object.keys(byId(items))).toEqual(['0x1111111111111111111111111111111111111111:YES'])
  })
})

describe('withTraderData', () => {
  const now = 1_000_000
  const address = '0x1111111111111111111111111111111111111111'

  function roster(overrides: Partial<Trader> = {}): Trader {
    return {
      address,
      name: 'nova',
      status: 'online',
      ...overrides,
    }
  }

  test('overlays the roster name and a live heart rate', () => {
    const [row] = toLeaderboardItems([trade()], { yes: 0.5 })
    const [item] = withTraderData([row!], [roster({ heartRate: 84, heartRateAt: now - 1_000 })], now)

    expect(item).toMatchObject({
      trader: address,
      name: 'nova',
      heartRate: 84,
    })
  })

  test('matches mixed-case wallet addresses', () => {
    const [row] = toLeaderboardItems([trade()], { yes: 0.5 })
    const [item] = withTraderData(
      [row!],
      [roster({ address: '0x1111111111111111111111111111111111111111'.toUpperCase(), name: 'kira' })],
      now,
    )

    expect(item?.name).toBe('kira')
  })

  test('keeps the truncated address when the trader is unknown', () => {
    const items = toLeaderboardItems([trade()], { yes: 0.5 })
    const next = withTraderData(items, [roster({ address: '0x2222222222222222222222222222222222222222' })], now)

    expect(next).toBe(items)
    expect(next[0]?.name).toBe('0x1111...1111')
    expect(next[0]?.heartRate).toBeUndefined()
  })

  test('drops a stale heart rate and still uses the roster name', () => {
    const [row] = toLeaderboardItems([trade()], { yes: 0.5 })
    const [item] = withTraderData([row!], [roster({ heartRate: 90, heartRateAt: now - 120_000 })], now)

    expect(item?.name).toBe('nova')
    expect(item?.heartRate).toBeUndefined()
  })
})

describe('leaderboard formatters', () => {
  test('formats share size and entry cents', () => {
    expect(formatShares(100)).toBe('100')
    expect(formatShares(12.34)).toBe('12.3')
    expect(formatCents(0.123)).toBe('12.3¢')
  })
})

function item(id: string, overrides: Partial<LeaderboardItem> = {}): LeaderboardItem {
  return {
    id,
    trader: id,
    name: id,
    avatar: '',
    frame: '',
    outcome: 'YES',
    side: 'up',
    shares: 10,
    avgPrice: 0.4,
    profit: 1,
    status: 'open',
    ...overrides,
  }
}

describe('withCloseExits', () => {
  test('overlays a firebase close onto the matching done row', () => {
    const [row] = toLeaderboardItems(
      [
        trade({ id: 'buy', t: 1, amount: 40, price: 0.25, cost: 10 }),
        trade({ id: 'sell', t: 2, side: 'SELL_YES', amount: 40, price: 0.4, cost: 16 }),
      ],
      { yes: 0.5 },
    )

    const [item] = withCloseExits([row!], [
      {
        id: 'c1',
        marketId: 'm1',
        trader: '0x1111111111111111111111111111111111111111',
        outcome: 'YES',
        exit: 'tp',
        profit: 6.25,
        shares: 40,
        t: 2,
      },
    ])

    expect(item).toMatchObject({ exit: 'tp', profit: 6.25, status: 'closed' })
  })

  test('re-ranks a closed lot after overlaying a larger firebase pnl', () => {
    const open = item('0x2222222222222222222222222222222222222222', { profit: 10, status: 'open' })
    const closed = item('0x1111111111111111111111111111111111111111', {
      profit: 1,
      status: 'closed',
      exit: 'tp',
    })

    const ranked = withCloseExits([open, closed], [
      {
        id: 'c1',
        marketId: 'm1',
        trader: '0x1111111111111111111111111111111111111111',
        outcome: 'YES',
        exit: 'tp',
        profit: 40,
        shares: 10,
        t: 2,
      },
    ])

    expect(ranked.map((row) => row.trader)).toEqual([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ])
    expect(ranked[0]).toMatchObject({ status: 'closed', profit: 40 })
  })
})

describe('advanceLeaderboardHold', () => {
  const first: LeaderboardHold = {
    marketKey: 'm1',
    items: [item('alice')],
    epoch: 0,
  }

  test('keeps the last board when the market ends', () => {
    expect(advanceLeaderboardHold(first, '', [])).toEqual({ hold: first, frozen: true })
  })

  test('keeps the last board until the next market has a trade', () => {
    expect(advanceLeaderboardHold(first, 'm2', [])).toEqual({ hold: first, frozen: true })
  })

  test('hands off and bumps epoch when the next market trades', () => {
    const nextItems = [item('bob')]
    expect(advanceLeaderboardHold(first, 'm2', nextItems)).toEqual({
      hold: { marketKey: 'm2', items: nextItems, epoch: 1 },
      frozen: false,
    })
  })

  test('updates in place on the same market', () => {
    const nextItems = [item('alice'), item('bob')]
    expect(advanceLeaderboardHold(first, 'm1', nextItems)).toEqual({
      hold: { marketKey: 'm1', items: nextItems, epoch: 0 },
      frozen: false,
    })
  })

  test('clears when the live market has no positions left', () => {
    expect(advanceLeaderboardHold(first, 'm1', [])).toEqual({
      hold: { marketKey: 'm1', items: [], epoch: 0 },
      frozen: false,
    })
  })

  test('reuses the empty hold instead of allocating another', () => {
    const empty: LeaderboardHold = { marketKey: '', items: [], epoch: 0 }
    const firstPass = advanceLeaderboardHold(empty, '', [])
    const secondPass = advanceLeaderboardHold(firstPass.hold, '', [])

    expect(firstPass).toEqual({ hold: empty, frozen: false })
    expect(secondPass.hold).toBe(firstPass.hold)
  })
})

describe('floatingProfitForTrader', () => {
  const trader = '0x1111111111111111111111111111111111111111'

  test('sums open YES and NO mark-to-market for one wallet', () => {
    expect(
      floatingProfitForTrader(
        [
          trade({ id: 'yes', outcome: 'YES', side: 'BUY_YES', amount: 50, price: 0.4, cost: 20 }),
          trade({
            id: 'no',
            t: 2,
            outcome: 'NO',
            side: 'BUY_NO',
            amount: 80,
            price: 0.3,
            cost: 24,
          }),
        ],
        { yes: 0.55, no: 0.45 },
        trader,
      ),
    ).toBeCloseTo(19.5)
  })

  test('ignores other wallets and fully closed lots', () => {
    expect(
      floatingProfitForTrader(
        [
          trade({ id: 'open', t: 1, amount: 100, price: 0.4, cost: 40 }),
          trade({
            id: 'other',
            t: 2,
            taker: '0x2222222222222222222222222222222222222222',
            amount: 100,
            price: 0.2,
            cost: 20,
          }),
          trade({ id: 'sell', t: 3, side: 'SELL_YES', amount: 100, price: 0.8, cost: 80 }),
        ],
        { yes: 0.9 },
        trader,
      ),
    ).toBe(0)
  })

  test('splits floating profit per outcome so each side can pick TP or SL', () => {
    expect(
      floatingProfitsForTrader(
        [
          trade({ id: 'yes', outcome: 'YES', side: 'BUY_YES', amount: 50, price: 0.4, cost: 20 }),
          trade({
            id: 'no',
            t: 2,
            outcome: 'NO',
            side: 'BUY_NO',
            amount: 80,
            price: 0.3,
            cost: 24,
          }),
        ],
        { yes: 0.55, no: 0.2 },
        trader,
      ),
    ).toEqual({ YES: 7.5, NO: -8 })
  })
})
