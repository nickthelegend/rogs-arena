import { describe, expect, test } from 'bun:test'
import { errorMessage, isAbortError } from '../async.ts'

describe('isAbortError', () => {
  test('treats an aborted signal as abort even without an error object', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isAbortError(undefined, controller.signal)).toBe(true)
  })

  test('recognizes AbortError and aborted messages', () => {
    const abort = new Error('Aborted')
    abort.name = 'AbortError'
    expect(isAbortError(abort)).toBe(true)
    expect(isAbortError(new Error('Aborted'))).toBe(true)
    expect(isAbortError(new Error('Indexer timed out'))).toBe(false)
  })
})

describe('errorMessage', () => {
  test('reads an Error message or falls back', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('nope')).toBe('nope')
  })

  test('unwraps a Somnia mempool rejection hidden as Missing or invalid parameters', () => {
    const node = { code: -32000, message: 'insufficient balance', data: '0x03' }
    const viem = Object.assign(
      new Error('Missing or invalid parameters.\nDouble check you have provided the correct parameters.'),
      {
        shortMessage: 'Missing or invalid parameters.',
        details: 'insufficient balance',
        cause: node,
      },
    )
    const sdk = Object.assign(new Error('@somnia-chain/markets-sdk: approve reverted: Missing or invalid parameters.'), {
      cause: viem,
    })

    expect(errorMessage(sdk)).toContain('insufficient balance')
    expect(errorMessage(sdk)).toContain('0.6 STT')
  })

  test('unwraps account-does-not-exist mempool status', () => {
    const node = { code: -32000, message: 'account does not exist', data: '0x02' }
    const wrapped = Object.assign(new Error('Missing or invalid parameters.'), {
      details: 'account does not exist',
      cause: node,
    })

    expect(errorMessage(wrapped)).toContain('account does not exist')
    expect(errorMessage(wrapped)).toContain('fund the wallet with STT')
  })
})
