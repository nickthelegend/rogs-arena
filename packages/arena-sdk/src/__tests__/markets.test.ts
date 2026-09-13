import { describe, expect, test } from 'bun:test'
import { PublicKey } from '@solana/web3.js'

import {
  MARKETS,
  MARKET_ROUND_BASE,
  ORACLE_PROGRAM_ID,
  PROGRAM_ID,
  marketById,
  marketBySymbol,
  marketOfRound,
  roundNumber,
} from '../constants'
import { arenaPda } from '../pda'

describe('coin markets', () => {
  test('nine markets with unique ids, symbols and feeds, SOL included', () => {
    expect(MARKETS.map((market) => market.symbol)).toEqual(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX', 'LINK'])
    expect(MARKETS.map((market) => market.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(new Set(MARKETS.map((market) => market.feed.toBase58())).size).toBe(9)
  })

  test('each feed is the MagicBlock oracle PDA for its Pyth Lazer id', () => {
    for (const market of MARKETS) {
      const [feed] = PublicKey.findProgramAddressSync(
        [Buffer.from('price_feed'), Buffer.from('pyth-lazer'), Buffer.from(String(market.pythLazerId))],
        ORACLE_PROGRAM_ID,
      )
      expect(feed.toBase58()).toBe(market.feed.toBase58())
    }
  })

  test('BTC keeps the original arena PDA; other markets add the market byte', () => {
    expect(arenaPda(PROGRAM_ID).toBase58()).toBe('ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ')
    expect(arenaPda(PROGRAM_ID, 0).toBase58()).toBe('ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ')
    const [sol] = PublicKey.findProgramAddressSync([Buffer.from('arena'), Uint8Array.of(2)], PROGRAM_ID)
    expect(arenaPda(PROGRAM_ID, 2).toBase58()).toBe(sol.toBase58())
    expect(new Set(MARKETS.map((market) => arenaPda(PROGRAM_ID, market.id).toBase58())).size).toBe(9)
  })

  test('namespaced round ids map back to market and round number', () => {
    expect(marketOfRound(67)).toBe(0)
    expect(roundNumber(67)).toBe(67)
    const link = 8 * MARKET_ROUND_BASE + 1_234
    expect(Number.isSafeInteger(link)).toBe(true)
    expect(marketOfRound(link)).toBe(8)
    expect(roundNumber(link)).toBe(1_234)
  })

  test('lookups by id and symbol', () => {
    expect(marketBySymbol('sol')?.id).toBe(2)
    expect(marketBySymbol('PEPE')).toBeNull()
    expect(marketById(5).symbol).toBe('DOGE')
    expect(() => marketById(9)).toThrow('Unknown market 9')
  })
})
