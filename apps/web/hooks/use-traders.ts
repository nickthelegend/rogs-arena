'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useArenaAuth } from '@/hooks/use-arena-auth'
import { useCurrentMarket } from '@/hooks/use-current-market'
import { useMarketBoard } from '@/hooks/use-market-board'
import { usePlayer } from '@/hooks/use-player'
import { useArenaSession } from '@/hooks/use-trade-setup'
import { arenaRealtime, useArenaRealtime } from '@/lib/arena-realtime'
import { errorMessage } from '@/lib/error'
import { heartReportMarkets, type MarketRounds } from '@/lib/markets'
import { nowSeconds } from '@/lib/session-key'
import { PRESENCE_HEARTBEAT_MS, traderFromDto } from '@/lib/traders'
import { HEART_BPM_MAX, HEART_BPM_MIN, keypairSigner, sendErTransaction, type PositionState } from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useMemo, useRef, useState } from 'react'

type HeartTargets = { positions: PositionState[]; rounds: MarketRounds; fallback: number }

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
  const { player } = usePlayer()
  const { arena } = useCurrentMarket()
  const { rounds } = useMarketBoard()
  const value = live ? bpm : null
  const valueRef = useRef(value)
  const targetsRef = useRef<HeartTargets>({ positions: [], rounds: {}, fallback: 0 })
  const [report, setReport] = useState<HeartChainReport>(emptyHeartReport)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  // Read at send time, so position and round changes never restart the 5 s report loop.
  useEffect(() => {
    targetsRef.current = {
      positions: player?.positions ?? [],
      rounds: arena
        ? { ...rounds, [arena.market]: { id: arena.current.id, status: arena.current.status, endTs: arena.current.endTs } }
        : rounds,
      // With no live position the reading still goes on-chain: via the selected coin when its arena exists, else BTC.
      fallback: arena?.market ?? 0,
    }
  }, [arena, player, rounds])

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
        // report_heart samples the position in the passed arena's running round, so the reading goes to every coin
        // where this wallet holds one, all in one ER transaction.
        const targets = targetsRef.current
        const markets = heartReportMarkets(targets.positions, targets.rounds, nowSeconds(), targets.fallback)
        const reports = await Promise.all(
          markets.map((market) =>
            instructions.reportHeart(session.keypair.publicKey, ownerKey, rounded, session.token, market),
          ),
        )
        const sent = await sendErTransaction(connections.er, reports, signer)
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
