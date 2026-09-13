import { describe, expect, test } from 'bun:test'
import { MARKET_ROUND_BASE, MARKETS, ROUND_OPEN, ROUND_RESOLVED } from '@rogs/arena-sdk'
import {
  DEFAULT_MARKET,
  dtoMarket,
  formatRoundLabel,
  heartReportMarkets,
  isInMarket,
  MARKET_STORAGE_KEY,
  MARKET_SYMBOLS,
  marketConfig,
  marketFromSearch,
  marketsToSettle,
  marketSymbolOfRound,
  marketUnavailableReason,
  parseMarketSymbol,
  positionsToSettle,
  readStoredMarket,
  resolveMarketSelection,
  urlWithMarket,
  writeStoredMarket,
  type MarketRounds,
} from '../markets'

const now = 1_789_274_500
const roundOf = (market: number, n: number) => market * MARKET_ROUND_BASE + n
const slot = (roundId: number, active = true) => ({ roundId, active })

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('market symbols', () => {
  test('mirror the SDK markets, in order', () => {
    expect([...MARKET_SYMBOLS]).toEqual(MARKETS.map((market) => market.symbol))
    expect(DEFAULT_MARKET).toBe('BTC')
  })

  test('parse tickers case-insensitively and reject anything else', () => {
    expect(parseMarketSymbol('sol')).toBe('SOL')
    expect(parseMarketSymbol(' Doge ')).toBe('DOGE')
    expect(parseMarketSymbol('PEPE')).toBeNull()
    expect(parseMarketSymbol('')).toBeNull()
    expect(parseMarketSymbol(2)).toBeNull()
    expect(parseMarketSymbol(null)).toBeNull()
  })

  test('look up the SDK config by ticker', () => {
    expect(marketConfig('LINK').id).toBe(8)
    expect(marketConfig('XRP').priceDecimals).toBe(4)
    expect(marketUnavailableReason('ETH')).toBe(
      'ETH rounds are not open yet: its arena account is not on the MagicBlock rollup.',
    )
  })

  test('namespaced round ids name their coin and per-market round number', () => {
    expect(marketSymbolOfRound(67)).toBe('BTC')
    expect(marketSymbolOfRound(roundOf(2, 5))).toBe('SOL')
    expect(marketSymbolOfRound(roundOf(9, 1))).toBeNull()
    expect(marketSymbolOfRound(-1)).toBeNull()
    expect(formatRoundLabel(roundOf(2, 5))).toBe('SOL round 5')
    expect(formatRoundLabel(67)).toBe('BTC round 67')
  })
})

describe('market selection', () => {
  test('?market= wins over the saved choice, which wins over BTC', () => {
    expect(resolveMarketSelection({ search: '?market=sol', stored: 'ETH' })).toEqual({ symbol: 'SOL', source: 'url' })
    expect(resolveMarketSelection({ search: '', stored: 'ETH' })).toEqual({ symbol: 'ETH', source: 'storage' })
    expect(resolveMarketSelection({ search: '', stored: null })).toEqual({ symbol: 'BTC', source: 'default' })
  })

  test('an unknown ticker in the URL or storage is ignored', () => {
    expect(resolveMarketSelection({ search: '?market=PEPE', stored: 'LINK' })).toEqual({ symbol: 'LINK', source: 'storage' })
    expect(resolveMarketSelection({ search: '?market=', stored: 'nope' })).toEqual({ symbol: 'BTC', source: 'default' })
  })

  test('reads the market next to other query params', () => {
    expect(marketFromSearch('?ref=x&market=eth')).toBe('ETH')
    expect(marketFromSearch('ref=x')).toBeNull()
  })

  test('saves to rogs.market and survives storage that is missing or throws', () => {
    const storage = new MemoryStorage()
    expect(writeStoredMarket(() => storage, 'SOL')).toBe(true)
    expect(storage.getItem(MARKET_STORAGE_KEY)).toBe('SOL')
    expect(readStoredMarket(() => storage)).toBe('SOL')

    const blocked = () => {
      throw new Error('SecurityError: access denied')
    }
    expect(readStoredMarket(blocked)).toBeNull()
    expect(writeStoredMarket(blocked, 'SOL')).toBe(false)
    expect(writeStoredMarket(() => ({ setItem: () => { throw new Error('QuotaExceededError') } }), 'ETH')).toBe(false)
    expect(readStoredMarket(() => null)).toBeNull()
    expect(writeStoredMarket(() => undefined, 'ETH')).toBe(false)
  })

  test('writes the market into the URL, keeping the path, other params and hash', () => {
    expect(urlWithMarket('https://rogs-arena.vercel.app/', 'SOL')).toBe('/?market=SOL')
    expect(urlWithMarket('http://localhost:3100/?ref=x&market=btc#chat', 'ETH')).toBe('/?ref=x&market=ETH#chat')
  })
})

describe('service rows by market', () => {
  test('a row without market came from the single-market service and is BTC', () => {
    expect(dtoMarket({})).toBe('BTC')
    expect(dtoMarket({ market: null })).toBe('BTC')
    expect(isInMarket({ roundId: 67 }, 'BTC')).toBe(true)
    expect(isInMarket({ roundId: 67 }, 'SOL')).toBe(false)
  })

  test('tickers match case-insensitively; a ticker this client does not know matches nothing', () => {
    expect(isInMarket({ market: 'sol' }, 'SOL')).toBe(true)
    expect(isInMarket({ market: 'SOL' }, 'BTC')).toBe(false)
    expect(dtoMarket({ market: 'PEPE' })).toBeNull()
    expect(isInMarket({ market: 'PEPE' }, 'BTC')).toBe(false)
  })
})

describe('settling before a trade', () => {
  const rounds: MarketRounds = {
    0: { id: 70, status: ROUND_OPEN, endTs: now + 120 },
    2: { id: roundOf(2, 12), status: ROUND_OPEN, endTs: now + 30 },
  }
  const positions = [
    slot(69),
    slot(70),
    slot(roundOf(2, 11)),
    slot(roundOf(2, 12)),
    slot(roundOf(1, 3)),
    slot(roundOf(4, 1), false),
  ]

  test('groups finished positions by the market of their round and skips each coin running round', () => {
    expect(marketsToSettle(positions, rounds, now)).toEqual([0, 1, 2])
    expect(positionsToSettle(positions, rounds, now).map((item) => item.roundId)).toEqual([
      69,
      roundOf(2, 11),
      roundOf(1, 3),
    ])
  })

  test('leaves out the coin being traded, whose buy settles its own slots', () => {
    expect(marketsToSettle(positions, rounds, now, { exclude: 0 })).toEqual([1, 2])
    expect(marketsToSettle(positions, rounds, now, { exclude: 2 })).toEqual([0, 1])
  })

  test('a round past its end, or already resolved, is settled even if the clock still names it', () => {
    const late: MarketRounds = { 0: { id: 70, status: ROUND_OPEN, endTs: now }, 2: { ...rounds[2]!, status: ROUND_RESOLVED } }
    expect(marketsToSettle([slot(70), slot(roundOf(2, 12))], late, now)).toEqual([0, 2])
  })

  test('nothing to settle when every held position is still running', () => {
    expect(marketsToSettle([slot(70), slot(roundOf(2, 12))], rounds, now)).toEqual([])
    expect(marketsToSettle([], rounds, now)).toEqual([])
  })

  test('ignores inactive slots and rounds of unknown markets', () => {
    expect(marketsToSettle([slot(roundOf(3, 1), false), slot(roundOf(12, 1)), slot(0)], {}, now)).toEqual([])
  })
})

describe('heart reports across markets', () => {
  const rounds: MarketRounds = {
    0: { id: 70, status: ROUND_OPEN, endTs: now + 120 },
    2: { id: roundOf(2, 12), status: ROUND_OPEN, endTs: now + 30 },
  }

  test('go to every coin holding a position in its running round', () => {
    expect(heartReportMarkets([slot(70), slot(roundOf(2, 12)), slot(69)], rounds, now, 5)).toEqual([0, 2])
  })

  test('a coin whose round clock is not known yet still gets the sample', () => {
    expect(heartReportMarkets([slot(roundOf(7, 4))], rounds, now, 0)).toEqual([7])
  })

  test('fall back to one market when no position is live', () => {
    expect(heartReportMarkets([slot(69)], rounds, now, 2)).toEqual([2])
    expect(heartReportMarkets([], rounds, now, 0)).toEqual([0])
  })
})
