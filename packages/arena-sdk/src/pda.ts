import { PublicKey } from '@solana/web3.js'

import { ARENA_SEED, BADGE_SEED, PLAYER_SEED, PROGRAM_ID, SESSION_PROGRAM_ID, SESSION_TOKEN_V2_SEED } from './constants'

const encoder = new TextEncoder()

/** Market 0 (BTC) is ["arena"]; market n is ["arena", [n]]. */
export function arenaPda(programId: PublicKey = PROGRAM_ID, market = 0) {
  const seeds = market === 0 ? [encoder.encode(ARENA_SEED)] : [encoder.encode(ARENA_SEED), Uint8Array.of(market)]
  return PublicKey.findProgramAddressSync(seeds, programId)[0]
}

export function playerPda(owner: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([encoder.encode(PLAYER_SEED), owner.toBytes()], programId)[0]
}

/** Base-layer badge record, written by the post-commit Magic Action of commit_player_badges. */
export function badgeRecordPda(owner: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([encoder.encode(BADGE_SEED), owner.toBytes()], programId)[0]
}

/** Gum session token V2: ["session_token_v2", target program, session signer, authority]. */
export function sessionTokenPda(sessionSigner: PublicKey, authority: PublicKey, targetProgram: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(SESSION_TOKEN_V2_SEED), targetProgram.toBytes(), sessionSigner.toBytes(), authority.toBytes()],
    SESSION_PROGRAM_ID,
  )[0]
}
