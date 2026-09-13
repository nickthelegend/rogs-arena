import type { AuthNonceDto, AuthVerifyDto } from '@/lib/arena-api'
import { errorMessage } from '@/lib/error'
import bs58 from 'bs58'
import { create } from 'zustand'

export const AUTH_STORAGE_PREFIX = 'rogs.auth.'
export const AUTH_EXPIRY_MARGIN_MS = 60_000

export type ArenaAuthSession = { token: string; wallet: string; expiresAt: number }
export type ArenaAuthStatus = 'signed-out' | 'signing' | 'signed-in' | 'error'
export type ArenaAuthState = {
  wallet: string | null
  session: ArenaAuthSession | null
  status: ArenaAuthStatus
  error: string | null
}

export type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>
export type ArenaAuthApi = {
  authNonce(wallet: string): Promise<AuthNonceDto>
  authVerify(wallet: string, signature: string): Promise<AuthVerifyDto>
}

export function authStorageKey(wallet: string) {
  return `${AUTH_STORAGE_PREFIX}${wallet}`
}

export function signInMessage(wallet: string, nonce: string) {
  return `Rogs Arena sign-in\nwallet: ${wallet}\nnonce: ${nonce}`
}

/** Accepts unix seconds, milliseconds, or an ISO string and returns milliseconds. */
export function expiresAtMs(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.length > 0) {
    if (/^\d+$/.test(value)) return expiresAtMs(Number(value))
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function isSessionLive(session: Pick<ArenaAuthSession, 'expiresAt'>, now = Date.now()) {
  return session.expiresAt - AUTH_EXPIRY_MARGIN_MS > now
}

/** A missing, unreadable, foreign, or expiring entry is not a session. */
export function parseStoredAuth(raw: string | null, wallet: string, now = Date.now()): ArenaAuthSession | null {
  if (!raw) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  if (typeof record.token !== 'string' || record.token.length === 0 || record.wallet !== wallet) return null

  const expiresAt = expiresAtMs(record.expiresAt)
  if (expiresAt == null) return null

  const session = { token: record.token, wallet, expiresAt }
  return isSessionLive(session, now) ? session : null
}

function browserStorage(): AuthStorage {
  if (typeof window === 'undefined') throw new Error('Arena sign-in only runs in the browser.')
  return window.localStorage
}

export function readStoredAuth(wallet: string, storage: AuthStorage = browserStorage(), now = Date.now()) {
  const key = authStorageKey(wallet)
  const raw = storage.getItem(key)
  const session = parseStoredAuth(raw, wallet, now)
  if (raw && !session) storage.removeItem(key)
  return session
}

export function writeStoredAuth(session: ArenaAuthSession, storage: AuthStorage = browserStorage()) {
  storage.setItem(authStorageKey(session.wallet), JSON.stringify(session))
}

export function clearStoredAuth(wallet: string, storage: AuthStorage = browserStorage()) {
  storage.removeItem(authStorageKey(wallet))
}

export async function signInWithWallet(input: {
  wallet: string
  signMessage: SignMessage | undefined
  api: ArenaAuthApi
  storage?: AuthStorage
}): Promise<ArenaAuthSession> {
  const { wallet, api } = input
  if (!input.signMessage) throw new Error('This wallet cannot sign messages, so it cannot sign in to the arena.')

  const { nonce, message } = await api.authNonce(wallet)
  if (typeof nonce !== 'string' || message !== signInMessage(wallet, nonce)) {
    throw new Error('The arena server asked to sign an unexpected message, so sign-in was stopped.')
  }

  const signature = await input.signMessage(new TextEncoder().encode(message))
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error('The wallet returned an invalid signature.')
  }

  const verified = await api.authVerify(wallet, bs58.encode(signature))
  if (verified.wallet !== wallet) throw new Error('The arena server signed in a different wallet.')

  const expiresAt = expiresAtMs(verified.expiresAt)
  if (typeof verified.token !== 'string' || verified.token.length === 0 || expiresAt == null) {
    throw new Error('The arena server returned an unusable sign-in token.')
  }

  const session = { token: verified.token, wallet, expiresAt }
  writeStoredAuth(session, input.storage ?? browserStorage())
  return session
}

export const useArenaAuthStore = create<ArenaAuthState>()(() => ({
  wallet: null,
  session: null,
  status: 'signed-out',
  error: null,
}))

const inflight = new Map<string, Promise<ArenaAuthSession>>()

/** Points the auth store at a wallet and restores its saved token, if one is still live. */
export function activateAuthWallet(wallet: string | null) {
  if (!wallet) {
    useArenaAuthStore.setState({ wallet: null, session: null, status: 'signed-out', error: null })
    return
  }

  try {
    const session = readStoredAuth(wallet)
    useArenaAuthStore.setState({
      wallet,
      session,
      status: session ? 'signed-in' : inflight.has(wallet) ? 'signing' : 'signed-out',
      error: null,
    })
  } catch (error) {
    useArenaAuthStore.setState({
      wallet,
      session: null,
      status: 'error',
      error: `Could not read the saved arena sign-in: ${errorMessage(error)}`,
    })
  }
}

export function signInArena(wallet: string, signMessage: SignMessage | undefined, api: ArenaAuthApi) {
  const existing = inflight.get(wallet)
  if (existing) return existing

  useArenaAuthStore.setState({ wallet, status: 'signing', error: null })

  const attempt = signInWithWallet({ wallet, signMessage, api })
    .then(
      (session) => {
        if (useArenaAuthStore.getState().wallet === wallet) {
          useArenaAuthStore.setState({ session, status: 'signed-in', error: null })
        }
        return session
      },
      (error: unknown) => {
        const message = errorMessage(error)
        if (useArenaAuthStore.getState().wallet === wallet) {
          useArenaAuthStore.setState({ session: null, status: 'error', error: message })
        }
        throw error instanceof Error ? error : new Error(message)
      },
    )
    .finally(() => {
      inflight.delete(wallet)
    })

  inflight.set(wallet, attempt)
  return attempt
}

export function signOutArena(wallet: string | null) {
  if (wallet) clearStoredAuth(wallet)
  useArenaAuthStore.setState({ session: null, status: 'signed-out', error: null })
}
