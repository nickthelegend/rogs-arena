import bs58 from 'bs58'
import nacl from 'tweetnacl'
import type { Collections } from './db'
import { HttpError } from './errors'

export const NONCE_TTL_MS = 5 * 60_000
export const SESSION_TTL_MS = 24 * 60 * 60_000

export const signInMessage = (wallet: string, nonce: string) =>
  `Rogs Arena sign-in\nwallet: ${wallet}\nnonce: ${nonce}`

export function verifyWalletSignature(wallet: string, message: string, signature: string): boolean {
  try {
    const signatureBytes = bs58.decode(signature)
    const publicKey = bs58.decode(wallet)
    if (signatureBytes.length !== nacl.sign.signatureLength) return false
    if (publicKey.length !== nacl.sign.publicKeyLength) return false
    return nacl.sign.detached.verify(new TextEncoder().encode(message), signatureBytes, publicKey)
  } catch {
    return false
  }
}

export async function createNonce(cols: Collections, wallet: string, now = Date.now()) {
  const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)))
  const message = signInMessage(wallet, nonce)
  await cols.nonces.insertOne({
    wallet,
    nonce,
    message,
    createdAt: new Date(now),
    expiresAt: new Date(now + NONCE_TTL_MS),
  })
  return { nonce, message }
}

export async function verifyLogin(cols: Collections, wallet: string, signature: string, now = Date.now()) {
  // TTL deletion is lazy, so expiry is also enforced in the query.
  const pending = await cols.nonces
    .find({ wallet, expiresAt: { $gt: new Date(now) } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray()
  if (pending.length === 0) throw new HttpError(401, 'No active nonce for this wallet; request a new one')
  const match = pending.find(doc => verifyWalletSignature(wallet, doc.message, signature))
  if (!match) throw new HttpError(401, 'Invalid signature')

  // Deleting is the single-use guard: a concurrent verify of the same nonce loses here.
  const consumed = await cols.nonces.deleteOne({ _id: match._id })
  if (consumed.deletedCount !== 1) throw new HttpError(401, 'Nonce already used; request a new one')

  const token = bs58.encode(crypto.getRandomValues(new Uint8Array(32)))
  const expiresAt = now + SESSION_TTL_MS
  await cols.sessions.insertOne({ token, wallet, createdAt: new Date(now), expiresAt: new Date(expiresAt) })
  return { token, wallet, expiresAt }
}

export async function walletForToken(cols: Collections, token: string, now = Date.now()): Promise<string | null> {
  const session = await cols.sessions.findOne({ token, expiresAt: { $gt: new Date(now) } })
  return session?.wallet ?? null
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  return header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null
}

export async function requireWallet(cols: Collections, req: Request): Promise<string> {
  const token = bearerToken(req)
  if (!token) throw new HttpError(401, 'Missing bearer token')
  const wallet = await walletForToken(cols, token)
  if (!wallet) throw new HttpError(401, 'Invalid or expired token')
  return wallet
}
