'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useArenaWallet } from '@/components/arena-wallet-provider'
import { usePlayer } from '@/hooks/use-player'
import {
  commitmentSignature,
  fetchBadgeRecord,
  sendBaseTransaction,
  sendErTransaction,
  type BadgeRecordState,
  type WalletSigner,
} from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import { useCallback, useEffect, useState } from 'react'

const RECORD_POLL_MS = 2_000
const RECORD_WAIT_MS = 90_000

export type BadgeSaveState =
  | { phase: 'idle' }
  | { phase: 'saving'; step: string }
  | { phase: 'saved'; erSignature: string; baseSignature: string | null }
  | { phase: 'error'; message: string }

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The owner's badge record on Solana and the action that updates it: commit_player_badges runs on the ER and
 * MagicBlock's post-commit Magic Action (record_badges) writes the record on Solana.
 */
export function useBadgeRecord() {
  const chain = useArenaChain()
  const wallet = useArenaWallet()
  const { player } = usePlayer()
  const owner = wallet.publicKey?.toBase58() ?? null
  const [loaded, setLoaded] = useState<{ owner: string; record: BadgeRecordState | null } | null>(null)
  const [save, setSave] = useState<BadgeSaveState>({ phase: 'idle' })

  const readRecord = useCallback(
    (address: string) => fetchBadgeRecord(chain.connections.base, new PublicKey(address), chain.programId),
    [chain],
  )

  useEffect(() => {
    if (!owner) return
    let cancelled = false
    readRecord(owner)
      .then((record) => {
        if (!cancelled) setLoaded({ owner, record })
      })
      .catch(() => {
        // The record is optional display data; a failed read leaves the previous value and the save button works.
      })
    return () => {
      cancelled = true
    }
  }, [owner, readRecord])

  const waitForRecord = useCallback(
    async (address: string, accept: (record: BadgeRecordState | null) => boolean) => {
      const deadline = Date.now() + RECORD_WAIT_MS
      while (Date.now() < deadline) {
        const record = await readRecord(address)
        if (accept(record)) return record
        await new Promise((resolve) => setTimeout(resolve, RECORD_POLL_MS))
      }
      return null
    },
    [readRecord],
  )

  const saveToSolana = useCallback(async () => {
    const publicKey = wallet.publicKey
    if (!publicKey || !player?.joined) return
    const address = publicKey.toBase58()
    const signer = { publicKey, signTransaction: wallet.signTransaction } as unknown as WalletSigner
    try {
      let before = await readRecord(address)
      if (!before) {
        setSave({ phase: 'saving', step: 'Creating your badge record on Solana…' })
        await sendBaseTransaction(chain.connections.base, [await chain.instructions.initBadgeRecord(publicKey)], signer)
        before = await waitForRecord(address, (record) => record !== null)
        if (!before) throw new Error('The badge record was not created on Solana in time. Try again.')
      }
      setSave({ phase: 'saving', step: 'Committing your player from the rollup…' })
      const commit = await sendErTransaction(chain.connections.er, [await chain.instructions.commitPlayerBadges(publicKey)], signer)
      setSave({ phase: 'saving', step: 'Waiting for the Magic Action on Solana…' })
      const previousUpdates = before.updates
      const [baseSignature, after] = await Promise.all([
        commitmentSignature(chain.connections.er, commit.signature).catch(() => null),
        waitForRecord(address, (record) => record !== null && record.updates > previousUpdates),
      ])
      if (!after) throw new Error('The commit landed, but the Magic Action has not updated the record on Solana yet. Try again shortly.')
      setLoaded({ owner: address, record: after })
      setSave({ phase: 'saved', erSignature: commit.signature, baseSignature })
    } catch (error) {
      setSave({ phase: 'error', message: describe(error) })
    }
  }, [chain, player, readRecord, waitForRecord, wallet.publicKey, wallet.signTransaction])

  return {
    record: loaded && loaded.owner === owner ? loaded.record : null,
    save,
    canSave: Boolean(owner && player?.joined) && save.phase !== 'saving',
    saveToSolana,
  }
}
