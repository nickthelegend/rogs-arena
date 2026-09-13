import { describe, expect, test } from 'bun:test'
import { Keypair, PublicKey } from '@solana/web3.js'

import { PROGRAM_ID, describeLogs, fairCheersCandidates } from '../index'

describe('describeLogs', () => {
  test('anchor errors keep their message and code', () => {
    const logs = ['Program log: AnchorError occurred. Error Code: Unauthorized. Error Number: 6000. Error Message: Signer is not allowed to act for this account.']
    expect(describeLogs(logs)).toEqual({ message: 'Signer is not allowed to act for this account', code: 6000 })
  })

  test('a custom error from this program maps through the IDL', () => {
    const described = describeLogs([`Program ${PROGRAM_ID.toBase58()} failed: custom program error: 0x1770`])!
    expect(described.code).toBe(6000)
    expect(described.message).not.toContain('0x1770')
  })

  test('a System program failure reports its own reason instead of a bare 0x0', () => {
    const logs = [
      'Program 11111111111111111111111111111111 invoke [2]',
      'Allocate: account Address { address: GfJreHenZExBN2WgmN8kxBr5WK71Ua9v9jMnVQ8d6cHE, base: None } already in use',
      'Program 11111111111111111111111111111111 failed: custom program error: 0x0',
    ]
    const described = describeLogs(logs)!
    expect(described.message).toContain('already in use')
    expect(described.message).not.toContain('Program error')
    expect(described.code).toBeNull()
  })
})

describe('fairCheersCandidates', () => {
  test('every distinct recent trader except the winner', () => {
    const [a, b, winner] = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey]
    const candidates = fairCheersCandidates({ recent: [a, PublicKey.default, winner, b, a] }, winner)
    expect(candidates.map((key) => key.toBase58())).toEqual([a.toBase58(), b.toBase58()])
  })
})
