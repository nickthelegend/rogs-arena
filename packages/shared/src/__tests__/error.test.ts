import { describe, expect, test } from 'bun:test'
import { errorMessage } from '../error'

describe('errorMessage', () => {
  test('reads an Error message, a string, or falls back', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('nope')).toBe('nope')
    expect(errorMessage('')).toBe('Unknown error')
    expect(errorMessage(undefined)).toBe('Unknown error')
  })
})
