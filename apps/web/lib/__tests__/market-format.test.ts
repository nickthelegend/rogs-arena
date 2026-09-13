import { describe, expect, test } from 'bun:test'
import { marketBySymbol } from '@rogs/arena-sdk'
import { formatMarketChange, formatMarketPrice } from '../format'

function decimals(symbol: string) {
  const market = marketBySymbol(symbol)
  if (!market) throw new Error(`no market ${symbol}`)
  return market.priceDecimals
}

describe('formatMarketPrice', () => {
  // Oracle prices read from the MagicBlock devnet feeds on 2026-09-13.
  test('shows each coin with its own decimals', () => {
    expect(formatMarketPrice(77197.84954341, decimals('BTC'))).toBe('$77,197.85')
    expect(formatMarketPrice(2519.08263817, decimals('ETH'))).toBe('$2,519.08')
    expect(formatMarketPrice(101.67872455, decimals('SOL'))).toBe('$101.68')
    expect(formatMarketPrice(726.48810573, decimals('BNB'))).toBe('$726.49')
    expect(formatMarketPrice(1.36345218, decimals('XRP'))).toBe('$1.3635')
    expect(formatMarketPrice(0.08463595, decimals('DOGE'))).toBe('$0.08464')
    expect(formatMarketPrice(0.72243736, decimals('SUI'))).toBe('$0.7224')
    expect(formatMarketPrice(7.3965, decimals('AVAX'))).toBe('$7.40')
    expect(formatMarketPrice(11.49379116, decimals('LINK'))).toBe('$11.494')
  })

  test('keeps trailing zeros so a ticking price does not change width', () => {
    expect(formatMarketPrice(0.1, 5)).toBe('$0.10000')
    expect(formatMarketPrice(100, 2)).toBe('$100.00')
  })

  test('shows a dash without a usable price', () => {
    expect(formatMarketPrice(undefined, 2)).toBe('--')
    expect(formatMarketPrice(Number.NaN, 4)).toBe('--')
  })
})

describe('formatMarketChange', () => {
  test('signs the move and uses the coin decimals', () => {
    expect(formatMarketChange(1.5, 0.0123, 2)).toBe('+$1.50 (+1.23%)')
    expect(formatMarketChange(-0.00012, -0.0015, 5)).toBe('-$0.00012 (-0.15%)')
    expect(formatMarketChange(undefined, 0.01, 2)).toBe('--')
  })
})
