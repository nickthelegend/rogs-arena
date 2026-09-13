import { GetCommitmentSignature } from '@magicblock-labs/ephemeral-rollups-sdk'
import type { Connection } from '@solana/web3.js'

/**
 * Base-layer signature of the commit that an ER transaction scheduled, resolved with the
 * MagicBlock SDK. Throws when the ER transaction did not schedule a commit.
 */
export function commitmentSignature(er: Connection, erSignature: string): Promise<string> {
  return GetCommitmentSignature(erSignature, er)
}
