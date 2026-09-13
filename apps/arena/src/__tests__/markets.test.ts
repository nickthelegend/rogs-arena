import { describe, expect, test } from 'bun:test'
import { MARKET_ROUND_BASE, MARKETS } from '@rogs/arena-sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { ArenaChain } from '../chain'
import { env } from '../env'
import { buildMarkets, DEFAULT_MARKET, isMarketSymbol, MARKET_SYMBOLS, marketIdOfRound, marketOfRound, roundNumberOf } from '../markets'
import { toHealthMarkets, toMarketDtos } from '../snapshot'

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX', 'LINK']
const chain = new ArenaChain(env)

describe('market table', () => {
  test('tickers follow MARKETS order and BTC is the default', () => {
    expect([...MARKET_SYMBOLS]).toEqual(SYMBOLS)
    expect(DEFAULT_MARKET).toBe('BTC')
    expect(chain.markets.map(market => [market.id, market.symbol])).toEqual(SYMBOLS.map((symbol, id) => [id, symbol]))
  })

  test('market keys are exact, case-sensitive tickers', () => {
    for (const symbol of SYMBOLS) expect(isMarketSymbol(symbol)).toBe(true)
    for (const value of ['sol', 'Btc', '', 'BTC ', 'BTC-5M', 'PEPE', '0']) expect(isMarketSymbol(value)).toBe(false)
  })

  test('round id -> market and round number', () => {
    expect(MARKET_ROUND_BASE).toBe(2 ** 40)
    expect(marketOfRound(1)).toBe('BTC')
    expect(marketOfRound(63)).toBe('BTC')
    expect(marketOfRound(MARKET_ROUND_BASE - 1)).toBe('BTC')
    expect(marketOfRound(MARKET_ROUND_BASE)).toBe('ETH')
    expect(marketOfRound(MARKET_ROUND_BASE + 1)).toBe('ETH')
    SYMBOLS.forEach((symbol, id) => {
      const roundId = id * MARKET_ROUND_BASE + 17
      expect(marketOfRound(roundId)).toBe(symbol)
      expect(marketIdOfRound(roundId)).toBe(id)
      expect(roundNumberOf(roundId)).toBe(17)
    })
    // A freshly initialized arena holds round number 0.
    expect(roundNumberOf(3 * MARKET_ROUND_BASE)).toBe(0)
    for (const bad of [9 * MARKET_ROUND_BASE, -1, 1.5, Number.NaN]) {
      expect(() => marketOfRound(bad)).toThrow('belongs to no known market')
    }
  })

  test('arena PDAs match the program seeds; BTC keeps ["arena"] and ORACLE_BTC_FEED', () => {
    const programId = new PublicKey(env.PROGRAM_ID)
    const markets = buildMarkets(programId, new PublicKey(env.ORACLE_BTC_FEED))
    expect(markets[0]!.arena.toBase58()).toBe('ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ')
    expect(markets[0]!.arena.equals(PublicKey.findProgramAddressSync([Buffer.from('arena')], programId)[0])).toBe(true)
    expect(markets[0]!.oracleFeed.toBase58()).toBe(env.ORACLE_BTC_FEED)
    for (const market of markets.slice(1)) {
      const [expected] = PublicKey.findProgramAddressSync([Buffer.from('arena'), Buffer.from([market.id])], programId)
      expect(market.arena.equals(expected)).toBe(true)
      expect(market.oracleFeed.equals(MARKETS[market.id]!.feed)).toBe(true)
    }
    expect(new Set(markets.map(market => market.arena.toBase58())).size).toBe(9)
  })

  test('the paying market of a cheers comes from the arena among the transaction accounts', () => {
    const stranger = Keypair.generate().publicKey.toBase58()
    const eth = chain.market('ETH').arena.toBase58()
    expect(chain.marketOfAccounts([stranger, eth, env.PROGRAM_ID])?.symbol).toBe('ETH')
    expect(chain.marketOfAccounts([stranger, env.PROGRAM_ID])).toBeNull()
    expect(() => chain.market('PEPE')).toThrow('Unknown market PEPE')
  })
})

describe('market arenas on the ER (live)', () => {
  test('one read returns all nine markets; BTC is live and every live arena stores its own market id', async () => {
    const arenas = await chain.fetchArenas()
    expect(arenas.map(arena => arena.market.symbol)).toEqual(SYMBOLS)
    expect(arenas[0]!.account).not.toBeNull()
    for (const { market, account } of arenas) if (account) expect(account.market).toBe(market.id)
    console.log(`[live] available on the ER: ${arenas.filter(arena => arena.account).map(arena => arena.market.symbol).join(', ')}`)

    const health = toHealthMarkets(chain.markets, arenas)
    expect(health.map(row => row.market)).toEqual(SYMBOLS)
    expect(health[0]).toMatchObject({ market: 'BTC', available: true })
    expect(['idle', 'open', 'resolved']).toContain(health[0]!.status!)
    expect(health[0]!.roundId).toBeGreaterThan(0)
    for (const row of health) {
      if (!row.available) expect(row).toEqual({ market: row.market, available: false, roundId: null, status: null, endTs: null })
      else expect(marketOfRound(row.roundId!)).toBe(row.market)
    }

    const rows = toMarketDtos(chain.markets, arenas, SYMBOLS.map(() => null))
    expect(rows.map(row => row.available)).toEqual(arenas.map(arena => arena.account !== null))
    expect(rows[2]).toMatchObject({ market: 'SOL', id: 2, name: 'Solana', color: '#9945FF', priceDecimals: 2, round: null })
    expect(rows[2]!.arena).toBe(chain.market('SOL').arena.toBase58())
    // No ER read at all: nothing is reported available.
    expect(toMarketDtos(chain.markets, null, []).every(row => !row.available && row.round === null)).toBe(true)
  }, 30_000)

  test('request handlers share a fresh arena read', async () => {
    const first = await chain.readArenas(60_000)
    expect(await chain.readArenas(60_000)).toBe(first)
  }, 30_000)
})
