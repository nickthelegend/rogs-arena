'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useArenaWallet } from '@/components/arena-wallet-provider'
import { usePlayer } from '@/hooks/use-player'
import { ArenaApiError, authNonce, authVerify, requestFaucet } from '@/lib/arena-api'
import { activateAuthWallet, clearStoredAuth, readStoredAuth, signInArena } from '@/lib/arena-auth'
import { errorMessage } from '@/lib/error'
import {
  parseStoredSession,
  readStoredSession,
  SESSION_HOURS,
  sessionStorageKey,
  writeStoredSession,
  type ArenaSession,
} from '@/lib/session-key'
import {
  failedTradeSetupStatus,
  faucetNeeds,
  formatTokenAmount,
  fundTradeWallet,
  idleTradeSetupStatus,
  isBusyTradeSetup,
  refreshTradeBalances,
  runTradeSetup,
  SOL_DECIMALS,
  SOL_MIN_LAMPORTS,
  type FaucetAsset,
  type TradeSetupBalances,
  type TradeSetupDeps,
  type TradeSetupStatus,
  type WalletChoice,
} from '@/lib/trade-setup'
import {
  createSessionKey,
  ensurePlayerDelegated,
  keypairSigner,
  sendErTransaction,
  type WalletSigner,
} from '@rogs/arena-sdk'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { PublicKey } from '@solana/web3.js'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

const authApi = { authNonce, authVerify }
const CONNECT_CANCEL_GRACE_MS = 1_500
const FAUCET_CONFIRM_TIMEOUT_MS = 45_000
const FAUCET_POLL_MS = 1_000

type ConnectWaiter = {
  choice: WalletChoice
  resolve: (wallet: string) => void
  reject: (error: Error) => void
  modalOpened: boolean
}

type WalletSession = { wallet: string; session: ArenaSession }

/** The session key saved in this browser for the connected wallet, or why it could not be read. */
type SavedSession = { session: ArenaSession | null; error: string | null }

const noSavedSession: SavedSession = { session: null, error: null }
let savedSessionCache: { wallet: string; programId: string; raw: string | null; value: SavedSession } | null = null

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function subscribeSavedSessions(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

/**
 * The saved session key as a useSyncExternalStore snapshot. It is cached by the raw stored value (or the read error),
 * so it stays the same object until that changes. Setup re-checks the key on-chain before relying on it.
 */
function savedSessionSnapshot(wallet: string | null, programId: PublicKey): SavedSession {
  if (!wallet) return noSavedSession
  const program = programId.toBase58()
  let raw: string | null = null
  let error: string | null = null
  try {
    raw = window.localStorage.getItem(sessionStorageKey(wallet))
  } catch (cause) {
    error = `Could not read the saved session key: ${errorMessage(cause)}`
  }
  const cached = savedSessionCache
  if (cached?.wallet === wallet && cached.programId === program && cached.raw === raw && cached.value.error === error) {
    return cached.value
  }
  const session = error ? null : parseStoredSession(raw, wallet, programId)
  savedSessionCache = { wallet, programId: program, raw, value: { session, error } }
  return savedSessionCache.value
}

function useTradeSetupController() {
  const chain = useArenaChain()
  const wallet = useArenaWallet()
  const { player, refresh: refreshPlayer } = usePlayer()
  const { visible: modalVisible } = useWalletModal()
  const address = wallet.publicKey?.toBase58() ?? null
  const [status, setStatus] = useState<TradeSetupStatus>(idleTradeSetupStatus)
  const [didPrepare, setDidPrepare] = useState(false)
  const [session, setSessionState] = useState<WalletSession | null>(null)
  const runningRef = useRef(false)
  const walletRef = useRef(wallet)
  const statusRef = useRef(status)
  const sessionRef = useRef<WalletSession | null>(null)
  const waiterRef = useRef<ConnectWaiter | null>(null)
  const previousAddressRef = useRef(address)

  useEffect(() => {
    walletRef.current = wallet
  }, [wallet])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const setSession = useCallback((next: WalletSession | null) => {
    sessionRef.current = next
    setSessionState(next)
  }, [])

  // Resolve a pending connect once the chosen wallet shows up, or reject when the modal closes without one.
  useEffect(() => {
    const waiter = waiterRef.current
    if (!waiter) return

    if (address && wallet.mode === waiter.choice) {
      waiterRef.current = null
      waiter.resolve(address)
      return
    }

    if (waiter.choice !== 'adapter') return
    if (modalVisible) {
      waiter.modalOpened = true
      return
    }
    if (!waiter.modalOpened || wallet.connecting) return

    const timer = window.setTimeout(() => {
      if (waiterRef.current !== waiter) return
      const latest = walletRef.current
      if (latest.publicKey || latest.connecting) return
      waiterRef.current = null
      waiter.reject(new Error(latest.error ?? 'Wallet connection was cancelled.'))
    }, CONNECT_CANCEL_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [address, modalVisible, wallet.connecting, wallet.mode])

  useEffect(
    () => () => {
      waiterRef.current?.reject(new Error('Setup was closed before a wallet connected.'))
      waiterRef.current = null
    },
    [],
  )

  // This wallet's saved session key is usable before setup runs; setup re-checks it on-chain before relying on it.
  const getSavedSession = useCallback(() => savedSessionSnapshot(address, chain.programId), [address, chain.programId])
  const saved = useSyncExternalStore(subscribeSavedSessions, getSavedSession, () => noSavedSession)
  const [reportedSaved, setReportedSaved] = useState<SavedSession>(noSavedSession)
  if (saved !== reportedSaved) {
    setReportedSaved(saved)
    if (saved.error) setStatus(failedTradeSetupStatus(new Error(saved.error), { address: address ?? undefined }))
  }

  /** The session key setup made or confirmed for `owner` in this tab, else the one saved in this browser. */
  const sessionFor = useCallback(
    (owner: string) => {
      const current = sessionRef.current
      if (current?.wallet === owner) return current.session
      try {
        return readStoredSession(owner, chain.programId)
      } catch {
        return null
      }
    },
    [chain.programId],
  )

  // Switching to another wallet starts that wallet's setup from the beginning.
  useEffect(() => {
    const previous = previousAddressRef.current
    if (previous === address) return
    previousAddressRef.current = address
    if (previous && !runningRef.current) {
      setStatus(idleTradeSetupStatus)
      setDidPrepare(false)
    }
  }, [address])

  const connectWallet = useCallback(
    (choice: WalletChoice) =>
      new Promise<string>((resolve, reject) => {
        const current = walletRef.current
        if (current.publicKey && current.mode === choice) {
          resolve(current.publicKey.toBase58())
          return
        }

        waiterRef.current?.reject(new Error('A newer wallet connection replaced this one.'))
        waiterRef.current = { choice, resolve, reject, modalOpened: false }

        try {
          if (choice === 'guest') current.playAsGuest()
          else current.connect()
        } catch (error) {
          waiterRef.current = null
          reject(error instanceof Error ? error : new Error(errorMessage(error)))
        }
      }),
    [],
  )

  const signerFor = useCallback((owner: string): WalletSigner => {
    const current = walletRef.current
    if (!current.publicKey || current.publicKey.toBase58() !== owner) {
      throw new Error('The connected wallet changed during setup. Start again.')
    }
    return {
      publicKey: current.publicKey,
      signTransaction: current.signTransaction,
    } as unknown as WalletSigner
  }, [])

  // Read by address, never through the render-time owner: during guest setup the wallet connects after this render.
  const readPlayer = useCallback((owner: string) => refreshPlayer(owner), [refreshPlayer])

  const waitForLamports = useCallback(
    async (owner: string, minimum: bigint, signature: string) => {
      const deadline = Date.now() + FAUCET_CONFIRM_TIMEOUT_MS
      let balance = 0n
      while (Date.now() < deadline) {
        balance = BigInt(await chain.connections.base.getBalance(new PublicKey(owner), 'confirmed'))
        if (balance >= minimum) return balance
        await sleep(FAUCET_POLL_MS)
      }
      throw new Error(
        `The faucet sent ${signature}, but the wallet still holds ${formatTokenAmount(balance, SOL_DECIMALS)} SOL after ${FAUCET_CONFIRM_TIMEOUT_MS / 1000}s.`,
      )
    },
    [chain],
  )

  const buildDeps = useCallback(
    (choice?: WalletChoice): TradeSetupDeps => ({
      getWallet: () => {
        const current = walletRef.current
        if (!current.publicKey) return null
        if (choice && current.mode !== choice) return null
        return current.publicKey.toBase58()
      },
      connect: () => connectWallet(choice ?? 'guest'),
      signIn: async (owner) => {
        if (readStoredAuth(owner)) {
          activateAuthWallet(owner)
          return
        }
        await signInArena(owner, (message) => walletRef.current.signMessage(message), authApi)
      },
      getSolBalance: async (owner) => BigInt(await chain.connections.base.getBalance(new PublicKey(owner), 'confirmed')),
      requestSol: async (owner) => {
        const auth = readStoredAuth(owner)
        if (!auth) throw new Error('Sign in to the arena before requesting devnet SOL.')
        try {
          const result = await requestFaucet(auth.token)
          if ('signature' in result) await waitForLamports(owner, SOL_MIN_LAMPORTS, result.signature)
          return result
        } catch (error) {
          if (error instanceof ArenaApiError && error.status === 401) {
            clearStoredAuth(owner)
            activateAuthWallet(owner)
          }
          throw error
        }
      },
      ensurePlayer: async (owner) => {
        const result = await ensurePlayerDelegated(chain.connections, chain.instructions, signerFor(owner))
        await readPlayer(owner)
        return { delegateSignature: result.delegateSignature }
      },
      ensureSession: async (owner) => {
        const stored = readStoredSession(owner, chain.programId)
        if (stored) {
          const token = await chain.connections.base.getAccountInfo(stored.token, 'confirmed')
          if (token) {
            setSession({ wallet: owner, session: stored })
            return { signature: null }
          }
        }
        const created = await createSessionKey(chain.connections, chain.instructions, signerFor(owner), SESSION_HOURS)
        const next: ArenaSession = {
          keypair: created.keypair as unknown as ArenaSession['keypair'],
          validUntil: created.validUntil,
          token: created.token as unknown as ArenaSession['token'],
        }
        writeStoredSession(owner, next)
        setSession({ wallet: owner, session: next })
        return { signature: created.signature }
      },
      getPlayer: async (owner) => {
        const account = await readPlayer(owner)
        return account ? { joined: account.joined, balance: account.balance } : null
      },
      claimChips: async (owner) => {
        const active = sessionFor(owner)
        if (!active) throw new Error('Create a session key before claiming chips.')
        const keypair = active.keypair as unknown as Parameters<typeof keypairSigner>[0]
        const instruction = await chain.instructions.claimChips(keypair.publicKey, new PublicKey(owner), active.token)
        const sent = await sendErTransaction(chain.connections.er, [instruction], keypairSigner(keypair))
        await readPlayer(owner)
        return sent
      },
    }),
    [chain, connectWallet, readPlayer, sessionFor, setSession, signerFor, waitForLamports],
  )

  const fail = useCallback(
    (error: unknown) => {
      const current = statusRef.current
      const owner = walletRef.current.publicKey?.toBase58() ?? current.address
      const balances =
        current.sol != null && current.chips != null ? { sol: current.sol, chips: current.chips } : undefined
      // A wallet that already has its session key stays on the island so funds can be retried from there.
      if (owner && sessionFor(owner)) setDidPrepare(true)
      setStatus(failedTradeSetupStatus(error, { address: owner ?? undefined, balances }))
    },
    [sessionFor],
  )

  const start = useCallback(
    async (choice?: WalletChoice) => {
      if (runningRef.current) return
      runningRef.current = true
      setDidPrepare(false)
      try {
        await runTradeSetup(buildDeps(choice), setStatus)
        setDidPrepare(true)
      } catch (error) {
        fail(error)
      } finally {
        runningRef.current = false
      }
    },
    [buildDeps, fail],
  )

  const fund = useCallback(
    async (asset?: FaucetAsset) => {
      const owner = walletRef.current.publicKey?.toBase58()
      if (runningRef.current || !owner) return
      runningRef.current = true
      try {
        await fundTradeWallet(buildDeps(), owner, setStatus, asset)
        setDidPrepare(true)
      } catch (error) {
        fail(error)
      } finally {
        runningRef.current = false
      }
    },
    [buildDeps, fail],
  )

  const refresh = useCallback(async () => {
    const owner = walletRef.current.publicKey?.toBase58()
    if (runningRef.current || !owner) return
    const current = statusRef.current
    const currentBalances =
      current.sol != null && current.chips != null ? { sol: current.sol, chips: current.chips } : undefined

    runningRef.current = true
    try {
      await refreshTradeBalances(buildDeps(), owner, setStatus, currentBalances)
      setDidPrepare(true)
    } catch (error) {
      fail(error)
    } finally {
      runningRef.current = false
    }
  }, [buildDeps, fail])

  useEffect(() => {
    if (!wallet.ready || !address || status.step !== 'idle') return
    const timer = window.setTimeout(() => {
      void start()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [address, start, status.step, wallet.ready])

  const chips = player?.balance ?? status.chips
  const balances = useMemo<TradeSetupBalances | undefined>(
    () => (status.sol != null && chips != null ? { sol: status.sol, chips } : undefined),
    [chips, status.sol],
  )
  const activeSession = session && session.wallet === address ? session.session : saved.session

  return useMemo(
    () => ({
      ready: wallet.ready,
      authenticated: Boolean(address),
      user: address ? { wallet: { address } } : null,
      status,
      balances,
      needs: balances ? faucetNeeds(balances) : { sol: Boolean(status.address), chips: Boolean(status.address) },
      settled: Boolean(address) && didPrepare,
      busy: isBusyTradeSetup(status.step),
      start,
      fund,
      refresh,
      session: activeSession,
      owner: address,
    }),
    [activeSession, address, balances, didPrepare, fund, refresh, start, status, wallet.ready],
  )
}

type TradeSetupContextValue = ReturnType<typeof useTradeSetupController>

const TradeSetupContext = createContext<TradeSetupContextValue | null>(null)

/** One setup flow for the whole page, shared by the island and the trading pane. */
export function TradeSetupProvider({ children }: { children: ReactNode }) {
  const value = useTradeSetupController()
  return createElement(TradeSetupContext.Provider, { value }, children)
}

export function useTradeSetup() {
  const context = useContext(TradeSetupContext)
  if (!context) throw new Error('useTradeSetup must be used within TradeSetupProvider')
  return context
}

/** The session key (if setup created one) and the owner wallet it trades for. */
export function useArenaSession() {
  const { session, owner } = useTradeSetup()
  return { session, owner }
}
