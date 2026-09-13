import { describe, expect, test } from 'bun:test'
import { Keypair, PublicKey } from '@solana/web3.js'

import { ARENA_IDL, MAX_CHEERS_CANDIDATES, PROGRAM_ID, RECENT_TRADERS, badgeRecordPda } from '../index'

describe('badges via Magic Action', () => {
  test('badge record PDA is ["badges", owner]', () => {
    const owner = Keypair.generate().publicKey
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from('badges'), owner.toBuffer()], PROGRAM_ID)
    expect(badgeRecordPda(owner).toBase58()).toBe(expected.toBase58())
  })

  test('IDL exposes the Magic Action instructions and the BadgeRecord account', () => {
    const names = ARENA_IDL.instructions.map((instruction: { name: string }) => instruction.name)
    expect(names).toEqual(expect.arrayContaining(['init_badge_record', 'commit_player_badges', 'record_badges']))
    expect(ARENA_IDL.accounts.map((account: { name: string }) => account.name)).toContain('BadgeRecord')
  })

  test('Fair Cheers cap matches every recent trader but the winner', () => {
    expect(MAX_CHEERS_CANDIDATES).toBe(RECENT_TRADERS - 1)
  })
})
