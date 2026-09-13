'use client'

import { authNonce, authVerify } from '@/lib/arena-api'
import { activateAuthWallet, AUTH_EXPIRY_MARGIN_MS, signInArena, useArenaAuthStore } from '@/lib/arena-auth'
import { errorMessage } from '@/lib/error'
import { loadGuestWallet, loadOrCreateGuestWallet, type GuestWallet } from '@/lib/guest-wallet'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export const WALLET_MODE_STORAGE_KEY = 'rogs.walletMode'

export type ArenaWalletMode = 'adapter' | 'guest'

type SolanaTransaction = Transaction | VersionedTransaction

export type ArenaWallet = {
  publicKey: PublicKey | null
  mode: ArenaWalletMode | null
  signTransaction: <T extends SolanaTransaction>(transaction: T) => Promise<T>
  signAllTransactions: <T extends SolanaTransaction>(transactions: T[]) => Promise<T[]>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  /** Opens the wallet-adapter modal (Phantom, Solflare, Backpack via Wallet Standard). */
  connect: () => void
  /** Switches to the devnet guest key in this browser, creating it on first use. */
  playAsGuest: () => void
  disconnect: () => Promise<void>
  ready: boolean
  connecting: boolean
  walletName: string | null
  error: string | null
}

const ArenaWalletContext = createContext<ArenaWallet | null>(null)
const authApi = { authNonce, authVerify }
const noWalletMessage = 'Connect a wallet or play as guest first.'
const maxTimeoutMs = 2_147_483_647

function readWalletMode(): ArenaWalletMode | null {
  const value = window.localStorage.getItem(WALLET_MODE_STORAGE_KEY)
  return value === 'adapter' || value === 'guest' ? value : null
}

function writeWalletMode(mode: ArenaWalletMode | null) {
  if (mode) window.localStorage.setItem(WALLET_MODE_STORAGE_KEY, mode)
  else window.localStorage.removeItem(WALLET_MODE_STORAGE_KEY)
}

export function ArenaWalletProvider({ children }: { children: ReactNode }) {
  const {
    publicKey: adapterKey,
    connected,
    connecting,
    wallet: adapterWallet,
    signTransaction: adapterSignTransaction,
    signAllTransactions: adapterSignAllTransactions,
    signMessage: adapterSignMessage,
    disconnect: adapterDisconnect,
  } = useWallet()
  const { setVisible } = useWalletModal()
  const [preferred, setPreferred] = useState<ArenaWalletMode | null>(null)
  const [guest, setGuest] = useState<GuestWallet | null>(null)
  const [restored, setRestored] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signInRequested = useRef(false)
  const walletName = adapterWallet?.adapter.name ?? null

  useEffect(() => {
    try {
      const stored = readWalletMode()
      setPreferred(stored)
      if (stored === 'guest') setGuest(loadGuestWallet())
    } catch (cause) {
      setError(`Could not restore the saved wallet: ${errorMessage(cause)}`)
    } finally {
      setRestored(true)
    }
  }, [])

  const mode: ArenaWalletMode | null =
    preferred === 'guest' && guest ? 'guest' : connected && adapterKey ? 'adapter' : null
  const publicKey = mode === 'guest' && guest ? guest.publicKey : mode === 'adapter' ? adapterKey : null
  const address = publicKey?.toBase58() ?? null

  useEffect(() => {
    if (!connected || preferred !== 'adapter') return
    try {
      writeWalletMode('adapter')
    } catch (cause) {
      setError(`Could not save the wallet choice: ${errorMessage(cause)}`)
    }
  }, [connected, preferred])

  const signTransaction = useCallback(
    async <T extends SolanaTransaction>(transaction: T): Promise<T> => {
      if (mode === 'guest' && guest) return guest.signTransaction(transaction)
      if (mode === 'adapter') {
        if (!adapterSignTransaction) throw new Error(`${walletName ?? 'This wallet'} cannot sign transactions.`)
        return adapterSignTransaction(transaction)
      }
      throw new Error(noWalletMessage)
    },
    [adapterSignTransaction, guest, mode, walletName],
  )

  const signAllTransactions = useCallback(
    async <T extends SolanaTransaction>(transactions: T[]): Promise<T[]> => {
      if (mode === 'guest' && guest) return guest.signAllTransactions(transactions)
      if (mode === 'adapter') {
        if (!adapterSignAllTransactions) {
          throw new Error(`${walletName ?? 'This wallet'} cannot sign several transactions at once.`)
        }
        return adapterSignAllTransactions(transactions)
      }
      throw new Error(noWalletMessage)
    },
    [adapterSignAllTransactions, guest, mode, walletName],
  )

  const signMessage = useCallback(
    async (message: Uint8Array) => {
      if (mode === 'guest' && guest) return guest.signMessage(message)
      if (mode === 'adapter') {
        if (!adapterSignMessage) throw new Error(`${walletName ?? 'This wallet'} cannot sign messages.`)
        return adapterSignMessage(message)
      }
      throw new Error(noWalletMessage)
    },
    [adapterSignMessage, guest, mode, walletName],
  )

  const connect = useCallback(() => {
    setError(null)
    signInRequested.current = true
    setPreferred('adapter')
    if (!connected) setVisible(true)
  }, [connected, setVisible])

  const playAsGuest = useCallback(() => {
    setError(null)
    try {
      const next = loadOrCreateGuestWallet()
      writeWalletMode('guest')
      setGuest(next)
      setPreferred('guest')
    } catch (cause) {
      const message = `Could not open the guest wallet: ${errorMessage(cause)}`
      setError(message)
      throw new Error(message)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setError(null)
    signInRequested.current = false
    setPreferred(null)
    setGuest(null)
    try {
      writeWalletMode(null)
    } catch (cause) {
      setError(`Could not clear the saved wallet choice: ${errorMessage(cause)}`)
    }
    if (!connected) return
    try {
      await adapterDisconnect()
    } catch (cause) {
      const message = `Could not disconnect ${walletName ?? 'the wallet'}: ${errorMessage(cause)}`
      setError(message)
      throw new Error(message)
    }
  }, [adapterDisconnect, connected, walletName])

  useEffect(() => {
    activateAuthWallet(address)
  }, [address])

  const authStatus = useArenaAuthStore((state) => (address && state.wallet === address ? state.status : null))
  const sessionExpiresAt = useArenaAuthStore((state) =>
    address && state.wallet === address ? (state.session?.expiresAt ?? null) : null,
  )

  // Guests sign in silently. An extension wallet is only asked to sign right after the player chose to connect it.
  useEffect(() => {
    if (!address || !mode || authStatus !== 'signed-out') return
    if (mode === 'adapter' && !signInRequested.current) return
    signInRequested.current = false
    signInArena(address, signMessage, authApi).catch((cause: unknown) => {
      setError(`Arena sign-in failed: ${errorMessage(cause)}`)
    })
  }, [address, authStatus, mode, signMessage])

  useEffect(() => {
    if (!address || sessionExpiresAt == null) return
    const delay = Math.min(Math.max(0, sessionExpiresAt - AUTH_EXPIRY_MARGIN_MS - Date.now()), maxTimeoutMs)
    const timer = window.setTimeout(() => activateAuthWallet(address), delay)
    return () => window.clearTimeout(timer)
  }, [address, sessionExpiresAt])

  const value = useMemo<ArenaWallet>(
    () => ({
      publicKey,
      mode,
      signTransaction,
      signAllTransactions,
      signMessage,
      connect,
      playAsGuest,
      disconnect,
      ready: restored && !connecting,
      connecting,
      walletName: mode === 'guest' ? 'Guest wallet (devnet)' : walletName,
      error,
    }),
    [
      connect,
      connecting,
      disconnect,
      error,
      mode,
      playAsGuest,
      publicKey,
      restored,
      signAllTransactions,
      signMessage,
      signTransaction,
      walletName,
    ],
  )

  return <ArenaWalletContext.Provider value={value}>{children}</ArenaWalletContext.Provider>
}

export function useArenaWallet() {
  const context = useContext(ArenaWalletContext)
  if (!context) throw new Error('useArenaWallet must be used within ArenaWalletProvider')
  return context
}
