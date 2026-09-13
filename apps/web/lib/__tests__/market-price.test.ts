import { describe, expect, test } from 'bun:test'
import type { OraclePrice } from '@rogs/arena-sdk'
import { applyOraclePrice, applyPriceHistory, initialPriceState, mergePriceHistory, priceStateFor } from '../market-price'
import { PRICE_HISTORY_SECS, PRICE_TICKS } from '../price-chart'

const BTC_FEED = '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr'
const SOL_FEED = 'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu'
const opened = 1_789_281_871

function oracle(feed: string, publishTime: number, price: number, postedSlot: bigint): OraclePrice {
  return { feed, raw: BigInt(Math.round(price * 1e8)), decimals: 8, price, publishTime, postedSlot }
}

describe('mergePriceHistory', () => {
  test('puts stored samples before live points, in time order, and a live point wins its second', () => {
    const live = [
      { time: opened, value: 101.5 },
      { time: opened + 1, value: 101.6 },
    ]
    const stored = [
      { t: (opened - 4) * 1000, price: 101.0 },
      { t: (opened - 2) * 1000, price: 101.2 },
      { t: opened * 1000, price: 101.4 },
    ]
    expect(mergePriceHistory(live, stored)).toEqual([
      { time: opened - 4, value: 101.0 },
      { time: opened - 2, value: 101.2 },
      { time: opened, value: 101.5 },
      { time: opened + 1, value: 101.6 },
    ])
  })

  test('sorts and de-duplicates stored samples and drops unusable ones', () => {
    const stored = [
      { t: (opened - 2) * 1000, price: 101.2 },
      { t: (opened - 6) * 1000, price: 100.8 },
      { t: (opened - 2) * 1000, price: 101.2 },
      { t: (opened - 4) * 1000, price: 0 },
      { t: Number.NaN, price: 101 },
    ]
    expect(mergePriceHistory([], stored)).toEqual([
      { time: opened - 6, value: 100.8 },
      { time: opened - 2, value: 101.2 },
    ])
  })

  test('keeps the newest hour of one-second points', () => {
    expect(PRICE_HISTORY_SECS).toBe(3_600)
    const stored = Array.from({ length: PRICE_TICKS + 10 }, (_, index) => ({
      t: (opened - PRICE_TICKS - 10 + index) * 1000,
      price: 100 + index / 1000,
    }))
    const merged = mergePriceHistory([{ time: opened, value: 105 }], stored)
    expect(merged).toHaveLength(PRICE_TICKS)
    expect(merged[0]?.time).toBe(opened - PRICE_TICKS + 1)
    expect(merged.at(-1)).toEqual({ time: opened, value: 105 })
  })
})

describe('market price state', () => {
  test('history that lands before the first live read seeds the chart, and live reads append to it', () => {
    let state = applyPriceHistory(initialPriceState, SOL_FEED, [
      { t: (opened - 2) * 1000, price: 101.2 },
      { t: opened * 1000, price: 101.4 },
    ])
    expect(state).toMatchObject({ feed: SOL_FEED, latest: null, status: 'hydrating', error: null })
    expect(state.points).toEqual([
      { time: opened - 2, value: 101.2 },
      { time: opened, value: 101.4 },
    ])
    state = applyOraclePrice(state, SOL_FEED, oracle(SOL_FEED, opened + 1, 101.45, 10n))
    expect(state.status).toBe('live')
    expect(state.points.map((point) => point.time)).toEqual([opened - 2, opened, opened + 1])
  })

  test('history that lands after live reads goes under them and keeps the latest read', () => {
    let state = applyOraclePrice(initialPriceState, SOL_FEED, oracle(SOL_FEED, opened, 101.5, 10n))
    state = applyOraclePrice(state, SOL_FEED, oracle(SOL_FEED, opened + 1, 101.6, 11n))
    const latest = state.latest
    state = applyPriceHistory(state, SOL_FEED, [
      { t: (opened - 2) * 1000, price: 101.2 },
      { t: opened * 1000, price: 101.4 },
    ])
    expect(state.latest).toBe(latest)
    expect(state.status).toBe('live')
    expect(state.points).toEqual([
      { time: opened - 2, value: 101.2 },
      { time: opened, value: 101.5 },
      { time: opened + 1, value: 101.6 },
    ])
    expect(applyPriceHistory(state, SOL_FEED, [])).toBe(state)
  })

  test('a live read from a posted slot that is not newer adds nothing', () => {
    const first = applyOraclePrice(initialPriceState, SOL_FEED, oracle(SOL_FEED, opened, 101.5, 10n))
    expect(applyOraclePrice(first, SOL_FEED, oracle(SOL_FEED, opened + 1, 101.7, 10n))).toBe(first)
  })

  test("switching coins discards the previous coin's points, whether stored or live", () => {
    let btc = applyPriceHistory(initialPriceState, BTC_FEED, [{ t: (opened - 2) * 1000, price: 77_297.66 }])
    btc = applyOraclePrice(btc, BTC_FEED, oracle(BTC_FEED, opened, 77_299, 10n))
    expect(btc.points).toHaveLength(2)

    expect(applyPriceHistory(btc, SOL_FEED, [{ t: (opened - 2) * 1000, price: 101.2 }])).toEqual({
      feed: SOL_FEED,
      latest: null,
      points: [{ time: opened - 2, value: 101.2 }],
      status: 'hydrating',
      error: null,
    })
    // Posted slots are compared per feed: SOL's first read counts even with a lower slot than BTC's last.
    const solLive = applyOraclePrice(btc, SOL_FEED, oracle(SOL_FEED, opened + 1, 101.4, 5n))
    expect(solLive.points).toEqual([{ time: opened + 1, value: 101.4 }])
    expect(solLive.latest?.feed).toBe(SOL_FEED)
    expect(priceStateFor(solLive, BTC_FEED)).toEqual({ ...initialPriceState, feed: BTC_FEED })
  })
})
