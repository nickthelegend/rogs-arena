'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useArenaWallet } from '@/components/arena-wallet-provider'
import { errorMessage } from '@/lib/error'
import { fetchPlayer, subscribePlayer, type PlayerState } from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const PLAYER_REFRESH_MS = 15_000

type PlayerSnapshot = {
  owner: string | null
  player: PlayerState | null
  loaded: boolean
  error: string | null
}

export type PlayerContextValue = {
  owner: string | null
  /** null until the Player account exists and is delegated to the ephemeral rollup. */
  player: PlayerState | null
  isLoading: boolean
  error: string | null
  /** Reads a Player from the rollup by address (default: the connected wallet) and updates the shared snapshot when it is the connected wallet's. */
  refresh: (target?: string) => Promise<PlayerState | null>
}

const PlayerContext = createContext<PlayerContextValue | null>(null)
const emptySnapshot: PlayerSnapshot = { owner: null, player: null, loaded: false, error: null }

function readError(cause: unknown) {
  return `Could not read your player account on the MagicBlock ephemeral rollup: ${errorMessage(cause)}`
}

function usePlayerLoader(): PlayerContextValue {
  const { connections, programId } = useArenaChain()
  const { publicKey } = useArenaWallet()
  const owner = publicKey?.toBase58() ?? null
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(emptySnapshot)

  useEffect(() => {
    if (!owner) return

    const key = new PublicKey(owner)
    let active = true
    const accept = (player: PlayerState | null) => {
      if (active) setSnapshot({ owner, player, loaded: true, error: null })
    }
    const reject = (cause: unknown) => {
      if (!active) return
      setSnapshot((current) => ({
        owner,
        player: current.owner === owner ? current.player : null,
        loaded: true,
        error: readError(cause),
      }))
    }

    const unsubscribe = subscribePlayer(connections.er, key, accept, reject, programId)
    // The account subscription carries every change; the poll only covers a dropped rollup websocket.
    const timer = window.setInterval(() => {
      fetchPlayer(connections.er, key, programId).then(accept, reject)
    }, PLAYER_REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [connections, owner, programId])

  const refresh = useCallback(
    async (target?: string) => {
      // Callers pass the address they need: a guest wallet connects mid-setup, when this closure still has no owner.
      const address = target ?? owner
      if (!address) return null
      const player = await fetchPlayer(connections.er, new PublicKey(address), programId)
      if (address === owner) setSnapshot({ owner: address, player, loaded: true, error: null })
      return player
    },
    [connections, owner, programId],
  )

  const current = owner != null && snapshot.owner === owner

  return useMemo(
    () => ({
      owner,
      player: current ? snapshot.player : null,
      isLoading: owner != null && !(current && snapshot.loaded),
      error: current ? snapshot.error : null,
      refresh,
    }),
    [current, owner, refresh, snapshot],
  )
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const value = usePlayerLoader()
  return createElement(PlayerContext.Provider, { value }, children)
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used within PlayerProvider')
  return context
}
