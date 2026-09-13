'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useArenaAuth } from '@/hooks/use-arena-auth'
import { useArenaSession } from '@/hooks/use-trade-setup'
import { arenaRealtime, useArenaRealtime } from '@/lib/arena-realtime'
import { errorMessage } from '@/lib/error'
import { PRESENCE_HEARTBEAT_MS, traderFromDto } from '@/lib/traders'
import { HEART_BPM_MAX, HEART_BPM_MIN, keypairSigner, sendErTransaction } from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useMemo, useRef, useState } from 'react'

type TradersStatus = 'loading' | 'live' | 'error'

/** How often a live wearable reading is written on-chain with `report_heart` (gasless on the ER). */
export const HEART_CHAIN_INTERVAL_MS = 5_000

export type HeartChainReport = { signature: string | null; ms: number | null; error: string | null }

const emptyHeartReport: HeartChainReport = { signature: null, ms: null, error: null }

/** Hands the arena sign-in to the tab's WebSocket, which owns hello and the 15 s presence beat. */
export function useTraderPresence() {
  const { token, wallet } = useArenaAuth()

  useEffect(() => {
    arenaRealtime().setAuth(token, wallet)
  }, [token, wallet])
}

/**
 * Broadcasts the live wearable bpm over WS `heart` (throttled to one frame per 2 s) and, once setup has a
 * session key, writes it on-chain with `report_heart` at most every 5 s. Calm pulse pays from the on-chain value.
 */
export function usePublishTraderHeartRate(bpm: number | null, live: boolean): HeartChainReport {
  const { token } = useArenaAuth()
  const { connections, instructions } = useArenaChain()
  const { session, owner } = useArenaSession()
  const value = live ? bpm : null
  const valueRef = useRef(value)
  const [report, setReport] = useState<HeartChainReport>(emptyHeartReport)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!token) return
    arenaRealtime().publishHeart(value)
  }, [token, value])

  useEffect(() => {
    if (!token) return
    return () => arenaRealtime().publishHeart(null)
  }, [token])

  useEffect(() => {
    if (!live || !session || !owner) return

    let stopped = false
    let sending = false
    const signer = keypairSigner(session.keypair as unknown as Parameters<typeof keypairSigner>[0])
    const ownerKey = new PublicKey(owner)

    const send = async () => {
      const current = valueRef.current
      if (sending || current == null) return
      const rounded = Math.round(current)
      // A reading outside the program's accepted range is a wearable glitch; it is not written.
      if (rounded < HEART_BPM_MIN || rounded > HEART_BPM_MAX) return

      sending = true
      try {
        const instruction = await instructions.reportHeart(session.keypair.publicKey, ownerKey, rounded, session.token)
        const sent = await sendErTransaction(connections.er, [instruction], signer)
        if (!stopped) setReport({ signature: sent.signature, ms: sent.ms, error: null })
      } catch (error) {
        if (!stopped) setReport({ signature: null, ms: null, error: `On-chain heart report failed: ${errorMessage(error)}` })
      } finally {
        sending = false
      }
    }

    void send()
    const timer = window.setInterval(() => void send(), HEART_CHAIN_INTERVAL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [connections, instructions, live, owner, session])

  return live && session ? report : emptyHeartReport
}

export function useTraders() {
  const dtos = useArenaRealtime((state) => state.traders)
  const anonymous = useArenaRealtime((state) => state.anonymous)
  const online = useArenaRealtime((state) => state.online)
  const serverTimeOffsetMs = useArenaRealtime((state) => state.serverTimeOffsetMs)
  const snapshotStatus = useArenaRealtime((state) => state.snapshotStatus)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PRESENCE_HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [])

  const traders = useMemo(
    () =>
      dtos
        .map((dto) => traderFromDto(dto, serverTimeOffsetMs))
        .sort((left, right) => left.address.localeCompare(right.address) || left.name.localeCompare(right.name)),
    [dtos, serverTimeOffsetMs],
  )

  const status: TradersStatus = snapshotStatus === 'ready' ? 'live' : snapshotStatus === 'error' ? 'error' : 'loading'

  return {
    traders,
    anonymous,
    online,
    status,
    now,
  }
}
