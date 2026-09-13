'use client'

import { useArenaWallet } from '@/components/arena-wallet-provider'
import { authNonce, authVerify } from '@/lib/arena-api'
import { signInArena, signOutArena, useArenaAuthStore } from '@/lib/arena-auth'
import { useCallback } from 'react'

const authApi = { authNonce, authVerify }

export function useArenaAuth() {
  const { publicKey, signMessage } = useArenaWallet()
  const wallet = publicKey?.toBase58() ?? null
  const state = useArenaAuthStore()
  const current = wallet != null && state.wallet === wallet
  const session = current ? state.session : null

  const signIn = useCallback(() => {
    if (!wallet) return Promise.reject(new Error('Connect a wallet or play as guest first.'))
    return signInArena(wallet, signMessage, authApi)
  }, [signMessage, wallet])

  const signOut = useCallback(() => signOutArena(wallet), [wallet])

  return {
    wallet,
    session,
    token: session?.token ?? null,
    status: current ? state.status : ('signed-out' as const),
    error: current ? state.error : null,
    signIn,
    signOut,
  }
}
