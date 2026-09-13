import { sessionTokenPda } from '@rogs/arena-sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'

// A Gum SessionTokenV2 keypair lets the arena accept trades without a wallet popup. It can only act
// through the rogs_arena program for this wallet, and only until `validUntil`.
export const SESSION_STORAGE_PREFIX = 'rogs.session.'
export const SESSION_HOURS = 24
export const SESSION_REFRESH_MARGIN_SECONDS = 5 * 60

export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type ArenaSession = {
  keypair: Keypair
  validUntil: number
  token: PublicKey
}

export function sessionStorageKey(wallet: string) {
  return `${SESSION_STORAGE_PREFIX}${wallet}`
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

/** Usable means it will not expire within the next five minutes. */
export function isSessionUsable(session: Pick<ArenaSession, 'validUntil'> | null, now = nowSeconds()) {
  return session != null && session.validUntil - SESSION_REFRESH_MARGIN_SECONDS > now
}

export function serializeSession(wallet: string, session: ArenaSession) {
  return JSON.stringify({
    wallet,
    secretKey: bs58.encode(session.keypair.secretKey),
    validUntil: session.validUntil,
    token: session.token.toBase58(),
  })
}

/** Returns null for a missing, unreadable, foreign, mismatched, or nearly expired session. */
export function parseStoredSession(
  raw: string | null,
  wallet: string,
  programId: PublicKey,
  now = nowSeconds(),
): ArenaSession | null {
  if (!raw) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  if (record.wallet !== wallet || typeof record.secretKey !== 'string' || typeof record.token !== 'string') return null
  if (typeof record.validUntil !== 'number' || !Number.isFinite(record.validUntil)) return null

  let keypair: Keypair
  let token: PublicKey
  try {
    keypair = Keypair.fromSecretKey(bs58.decode(record.secretKey))
    token = new PublicKey(record.token)
  } catch {
    return null
  }

  const expected = sessionTokenPda(keypair.publicKey, new PublicKey(wallet), programId)
  if (expected.toBase58() !== token.toBase58()) return null

  const session = { keypair, validUntil: record.validUntil, token }
  return isSessionUsable(session, now) ? session : null
}

function browserStorage(): SessionStorage {
  if (typeof window === 'undefined') throw new Error('Session keys only live in the browser.')
  return window.localStorage
}

export function readStoredSession(
  wallet: string,
  programId: PublicKey,
  storage: SessionStorage = browserStorage(),
  now = nowSeconds(),
) {
  const key = sessionStorageKey(wallet)
  const raw = storage.getItem(key)
  const session = parseStoredSession(raw, wallet, programId, now)
  if (raw && !session) storage.removeItem(key)
  return session
}

export function writeStoredSession(wallet: string, session: ArenaSession, storage: SessionStorage = browserStorage()) {
  storage.setItem(sessionStorageKey(wallet), serializeSession(wallet, session))
}

export function clearStoredSession(wallet: string, storage: SessionStorage = browserStorage()) {
  storage.removeItem(sessionStorageKey(wallet))
}
