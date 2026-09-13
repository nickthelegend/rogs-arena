import { describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import { env, parseEnv } from '../env'
import { HttpError } from '../errors'
import {
  arenaQuerySchema,
  chatQuerySchema,
  cheersQuerySchema,
  nonceBodySchema,
  parseInput,
  profileBodySchema,
  roundQuerySchema,
  roundsQuerySchema,
  settlementsQuerySchema,
  verifyBodySchema,
  wsClientMessageSchema,
} from '../schemas'

const wallet = Keypair.generate().publicKey.toBase58()

const inputError = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(400)
    return (error as HttpError).message
  }
  throw new Error('expected a validation error')
}

describe('HTTP body validation', () => {
  test('wallet addresses must be 32-byte base58 keys and keep their case', () => {
    expect(parseInput(nonceBodySchema, { wallet })).toEqual({ wallet })
    // Lowercasing a random key can still decode to another valid 32-byte key, so use a fixed key
    // containing "L": its lowercase "l" is outside the base58 alphabet.
    const programId = 'J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q'
    expect(parseInput(nonceBodySchema, { wallet: programId })).toEqual({ wallet: programId })
    expect(inputError(() => parseInput(nonceBodySchema, { wallet: programId.toLowerCase() }))).toBe(
      'wallet: Invalid wallet address',
    )
    expect(inputError(() => parseInput(nonceBodySchema, { wallet: `${wallet.slice(0, -1)}0` }))).toBe(
      'wallet: Invalid wallet address',
    )
    expect(inputError(() => parseInput(nonceBodySchema, { wallet: 'abc' }))).toBe('wallet: Invalid wallet address')
    expect(inputError(() => parseInput(nonceBodySchema, {}))).toStartWith('wallet: ')
  })

  test('verify requires a signature', () => {
    expect(parseInput(verifyBodySchema, { wallet, signature: 'sig' })).toEqual({ wallet, signature: 'sig' })
    expect(inputError(() => parseInput(verifyBodySchema, { wallet, signature: '' }))).toBe('signature: signature is required')
  })

  test('displayName is trimmed, 2-24 chars, letters/digits/space/_-.', () => {
    expect(parseInput(profileBodySchema, { displayName: '  Nick_the.legend-1 ' })).toEqual({ displayName: 'Nick_the.legend-1' })
    expect(parseInput(profileBodySchema, { displayName: 'Zoë 7' })).toEqual({ displayName: 'Zoë 7' })
    expect(inputError(() => parseInput(profileBodySchema, { displayName: ' a ' }))).toBe(
      'displayName: Display name must be 2-24 characters',
    )
    expect(inputError(() => parseInput(profileBodySchema, { displayName: 'x'.repeat(25) }))).toBe(
      'displayName: Display name must be 2-24 characters',
    )
    expect(inputError(() => parseInput(profileBodySchema, { displayName: '<script>' }))).toBe(
      'displayName: Display name may only contain letters, digits, spaces, _ - .',
    )
    expect(inputError(() => parseInput(profileBodySchema, {}))).toBe('displayName: displayName is required')
  })
})

describe('query validation', () => {
  test('limits default, clamp and reject junk', () => {
    expect(parseInput(roundsQuerySchema, {})).toEqual({ market: 'BTC', limit: 96 })
    expect(parseInput(roundsQuerySchema, { limit: '10' })).toEqual({ market: 'BTC', limit: 10 })
    expect(parseInput(roundsQuerySchema, { limit: '5000' })).toEqual({ market: 'BTC', limit: 200 })
    expect(parseInput(chatQuerySchema, {})).toEqual({ limit: 50 })
    expect(parseInput(cheersQuerySchema, { limit: '999' })).toEqual({ limit: 100 })
    expect(inputError(() => parseInput(roundsQuerySchema, { limit: 'abc' }))).toBe('limit: limit must be a positive integer')
    expect(inputError(() => parseInput(roundsQuerySchema, { limit: '0' }))).toBe('limit: limit must be a positive integer')
  })

  test('roundId is a required non-negative integer', () => {
    expect(parseInput(roundQuerySchema, { roundId: '42' })).toEqual({ market: 'BTC', roundId: 42 })
    // Namespaced ids (market * 2^40 + n) stay exact numbers.
    expect(parseInput(roundQuerySchema, { market: 'ETH', roundId: '1099511627779' })).toEqual({ market: 'ETH', roundId: 1_099_511_627_779 })
    expect(inputError(() => parseInput(roundQuerySchema, {}))).toBe('roundId: roundId is required')
    expect(inputError(() => parseInput(roundQuerySchema, { roundId: '-1' }))).toBe(
      'roundId: roundId must be a non-negative integer',
    )
  })

  test('market is an exact ticker, BTC when missing', () => {
    expect(parseInput(arenaQuerySchema, {})).toEqual({ market: 'BTC' })
    for (const market of ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX', 'LINK']) {
      expect(parseInput(arenaQuerySchema, { market })).toEqual({ market })
    }
    const unknown = 'market: market must be one of BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK'
    expect(inputError(() => parseInput(arenaQuerySchema, { market: 'sol' }))).toBe(unknown)
    expect(inputError(() => parseInput(arenaQuerySchema, { market: '' }))).toBe(unknown)
    expect(inputError(() => parseInput(roundsQuerySchema, { market: 'PEPE' }))).toBe(unknown)
    expect(inputError(() => parseInput(roundQuerySchema, { market: 'BTC-5M', roundId: '1' }))).toBe(unknown)
  })

  test('settlement filters: an owner-only query spans all markets, anything else is one market', () => {
    expect(parseInput(settlementsQuerySchema, {})).toEqual({ market: 'BTC' })
    expect(parseInput(settlementsQuerySchema, { owner: wallet })).toEqual({ owner: wallet })
    expect(parseInput(settlementsQuerySchema, { owner: wallet, market: 'SOL' })).toEqual({ market: 'SOL', owner: wallet })
    expect(parseInput(settlementsQuerySchema, { roundId: '3', owner: wallet })).toEqual({ market: 'BTC', roundId: 3, owner: wallet })
    expect(parseInput(settlementsQuerySchema, { roundId: '3', market: 'XRP' })).toEqual({ market: 'XRP', roundId: 3 })
    expect(inputError(() => parseInput(settlementsQuerySchema, { owner: 'nope' }))).toBe('owner: Invalid wallet address')
    expect(inputError(() => parseInput(settlementsQuerySchema, { owner: wallet, market: 'btc' }))).toStartWith('market: ')
  })
})

describe('websocket message validation', () => {
  const parse = (message: unknown) => wsClientMessageSchema.safeParse(message)

  test('hello with and without a token', () => {
    expect(parse({ type: 'hello', sessionId: 'tab-1' }).data).toEqual({ type: 'hello', sessionId: 'tab-1', market: 'BTC' })
    expect(parse({ type: 'hello', sessionId: 'tab-1', token: 'abc', market: 'SUI' }).data).toEqual({
      type: 'hello',
      sessionId: 'tab-1',
      token: 'abc',
      market: 'SUI',
    })
    expect(parse({ type: 'hello', sessionId: '' }).success).toBe(false)
    expect(parse({ type: 'hello', sessionId: 'tab-1', market: 'Sui' }).success).toBe(false)
  })

  test('market switch frames need a known ticker', () => {
    expect(parse({ type: 'market', market: 'AVAX' }).data).toEqual({ type: 'market', market: 'AVAX' })
    expect(parse({ type: 'market' }).success).toBe(false)
    expect(parse({ type: 'market', market: 7 }).success).toBe(false)
    const result = parse({ type: 'market', market: 'FOO' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('market must be one of BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK')
  })

  test('heart bpm must be 30..230 or null', () => {
    expect(parse({ type: 'heart', bpm: 30 }).data).toEqual({ type: 'heart', bpm: 30 })
    expect(parse({ type: 'heart', bpm: 72.4 }).data).toEqual({ type: 'heart', bpm: 72 })
    expect(parse({ type: 'heart', bpm: null }).data).toEqual({ type: 'heart', bpm: null })
    expect(parse({ type: 'heart', bpm: 29 }).success).toBe(false)
    expect(parse({ type: 'heart', bpm: 231 }).success).toBe(false)
    expect(parse({ type: 'heart' }).success).toBe(false)
  })

  test('chat is trimmed and 1..280 chars', () => {
    expect(parse({ type: 'chat', message: '  gm  ' }).data).toEqual({ type: 'chat', message: 'gm' })
    expect(parse({ type: 'chat', message: 'x'.repeat(280) }).success).toBe(true)
    expect(parse({ type: 'chat', message: 'x'.repeat(281) }).success).toBe(false)
    expect(parse({ type: 'chat', message: '   ' }).success).toBe(false)
  })

  test('unknown message types are rejected', () => {
    expect(parse({ type: 'trade' }).success).toBe(false)
    expect(parse({ type: 'presence' }).data).toEqual({ type: 'presence' })
  })
})

describe('env validation', () => {
  test('the local env parses into typed values', () => {
    expect(env.KEEPER_SECRET_KEY.length).toBe(64)
    expect(env.FAUCET_SECRET_KEY.length).toBe(64)
    expect(env.IDL_PATH.endsWith('rogs_arena.json')).toBe(true)
  })

  test('defaults apply for PORT and the feature flags', () => {
    const parsed = parseEnv({ ...process.env, PORT: undefined, KEEPER_ENABLED: undefined, INDEXER_ENABLED: 'false' })
    expect(parsed.PORT).toBe(8787)
    expect(parsed.KEEPER_ENABLED).toBe(true)
    expect(parsed.INDEXER_ENABLED).toBe(false)
  })

  test('a malformed secret key fails without echoing its value', () => {
    const secret = '[1,2,3,"leak-me"]'
    let message = ''
    try {
      parseEnv({ ...process.env, KEEPER_SECRET_KEY: secret })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('KEEPER_SECRET_KEY must be a JSON array of 64 byte values')
    expect(message).not.toContain('leak-me')
  })
})
