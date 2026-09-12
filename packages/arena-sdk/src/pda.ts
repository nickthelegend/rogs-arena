import { PublicKey } from '@solana/web3.js'

import { ARENA_SEED, PLAYER_SEED, PROGRAM_ID, SESSION_PROGRAM_ID, SESSION_TOKEN_V2_SEED } from './constants'

const encoder = new TextEncoder()

export function arenaPda(programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([encoder.encode(ARENA_SEED)], programId)[0]
}

export function playerPda(owner: PublicKey, programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([encoder.encode(PLAYER_SEED), owner.toBytes()], programId)[0]
}

/** Gum session token V2: ["session_token_v2", target program, session signer, authority]. */
export function sessionTokenPda(sessionSigner: PublicKey, authority: PublicKey, targetProgram: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(SESSION_TOKEN_V2_SEED), targetProgram.toBytes(), sessionSigner.toBytes(), authority.toBytes()],
    SESSION_PROGRAM_ID,
  )[0]
}
