import { describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import { env, parseEnv } from '../env'
import { HttpError } from '../errors'
import {
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
    expect(parseInput(roundsQuerySchema, {})).toEqual({ limit: 96 })
    expect(parseInput(roundsQuerySchema, { limit: '10' })).toEqual({ limit: 10 })
    expect(parseInput(roundsQuerySchema, { limit: '5000' })).toEqual({ limit: 200 })
    expect(parseInput(chatQuerySchema, {})).toEqual({ limit: 50 })
    expect(parseInput(cheersQuerySchema, { limit: '999' })).toEqual({ limit: 100 })
    expect(inputError(() => parseInput(roundsQuerySchema, { limit: 'abc' }))).toBe('limit: limit must be a positive integer')
    expect(inputError(() => parseInput(roundsQuerySchema, { limit: '0' }))).toBe('limit: limit must be a positive integer')
  })

  test('roundId is a required non-negative integer', () => {
    expect(parseInput(roundQuerySchema, { roundId: '42' })).toEqual({ roundId: 42 })
    expect(inputError(() => parseInput(roundQuerySchema, {}))).toBe('roundId: roundId is required')
    expect(inputError(() => parseInput(roundQuerySchema, { roundId: '-1' }))).toBe(
      'roundId: roundId must be a non-negative integer',
    )
  })

  test('settlement filters are both optional', () => {
    expect(parseInput(settlementsQuerySchema, {})).toEqual({})
    expect(parseInput(settlementsQuerySchema, { roundId: '3', owner: wallet })).toEqual({ roundId: 3, owner: wallet })
    expect(inputError(() => parseInput(settlementsQuerySchema, { owner: 'nope' }))).toBe('owner: Invalid wallet address')
  })
})

describe('websocket message validation', () => {
  const parse = (message: unknown) => wsClientMessageSchema.safeParse(message)

  test('hello with and without a token', () => {
    expect(parse({ type: 'hello', sessionId: 'tab-1' }).data).toEqual({ type: 'hello', sessionId: 'tab-1' })
    expect(parse({ type: 'hello', sessionId: 'tab-1', token: 'abc' }).data).toEqual({
      type: 'hello',
      sessionId: 'tab-1',
      token: 'abc',
    })
    expect(parse({ type: 'hello', sessionId: '' }).success).toBe(false)
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
