import type { Keypair, PublicKey } from '@solana/web3.js'
import {
  fetchPlayer,
  parseArenaEvents,
  playerPda,
  positionForRound,
  sendErTransaction,
  waitFor,
  type ArenaConnections,
  type ArenaInstructions,
  type PositionSettled,
  type WalletSigner,
} from '../../src/index'

export type ObservedSettlement = {
  event: PositionSettled
  signature: string
  settledBy: 'script' | 'keeper'
  balance: bigint
}

/**
 * Settles `owner`'s position in `roundId` while the live keeper may be settling it too.
 * settle_player is idempotent, so our transaction is a no-op when the keeper wins the race;
 * the PositionSettled event is read from whichever transaction actually settled the slot.
 */
export async function settleObserved(
  connections: ArenaConnections,
  instructions: ArenaInstructions,
  owner: PublicKey,
  roundId: number,
  payer: Keypair | WalletSigner,
  market = 0,
): Promise<ObservedSettlement> {
  const programId = instructions.programId
  const sent = await sendErTransaction(connections.er, [await instructions.settlePlayer(owner, market)], payer)
  const player = await waitFor(
    async () => {
      const state = await fetchPlayer(connections.er, owner, programId)
      return state && !positionForRound(state, roundId) ? state : null
    },
    { timeoutMs: 30_000, intervalMs: 1_000, label: `round ${roundId} position of ${owner.toBase58()} to settle` },
  )
  const signatures = await connections.er.getSignaturesForAddress(playerPda(owner, programId), { limit: 25 }, 'confirmed')
  for (const { signature, err } of signatures) {
    if (err) continue
    const tx = await connections.er.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    for (const event of parseArenaEvents(tx?.meta?.logMessages ?? [], programId)) {
      if (event.name === 'PositionSettled' && event.data.roundId === roundId && event.data.owner.equals(owner)) {
        return { event: event.data, signature, settledBy: signature === sent.signature ? 'script' : 'keeper', balance: player.balance }
      }
    }
  }
  throw new Error(`No PositionSettled event found for ${owner.toBase58()} in round ${roundId}`)
}
