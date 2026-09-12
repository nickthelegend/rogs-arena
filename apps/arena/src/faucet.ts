import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import type { ObjectId } from 'mongodb'
import { ChainTxError, type ArenaChain } from './chain'
import type { Collections } from './db'
import { HttpError } from './errors'
import { errorMessage } from './util'

export const FAUCET_LAMPORTS = 20_000_000
export const FAUCET_MIN_BALANCE = 10_000_000
export const FAUCET_WINDOW_MS = 24 * 60 * 60_000
export const FAUCET_WALLET_LIMIT = 1
export const FAUCET_IP_LIMIT = 5
export const FAUCET_WALLET_LIMIT_ERROR = 'Faucet limit reached: 1 request per wallet every 24 hours'
export const FAUCET_IP_LIMIT_ERROR = 'Faucet limit reached: 5 requests per IP every 24 hours'
const FEE_BUFFER_LAMPORTS = 10_000

export type FaucetReservation = { ok: true; id: ObjectId } | { ok: false; error: string }
export type FaucetResult = { signature: string; lamports: number } | { skipped: true; balance: number }

/**
 * Claims a faucet slot before sending. The reservation is inserted first and then counted,
 * so concurrent requests cannot both slip under the limit.
 */
export async function reserveFaucet(cols: Collections, wallet: string, ip: string, now = Date.now()): Promise<FaucetReservation> {
  const { insertedId } = await cols.faucet.insertOne({
    wallet,
    ip,
    ts: now,
    status: 'pending',
    signature: null,
    lamports: null,
  })
  const window = { $gt: now - FAUCET_WINDOW_MS, $lte: now }
  const [byWallet, byIp] = await Promise.all([
    cols.faucet.countDocuments({ wallet, ts: window }),
    cols.faucet.countDocuments({ ip, ts: window }),
  ])
  if (byWallet > FAUCET_WALLET_LIMIT || byIp > FAUCET_IP_LIMIT) {
    await cols.faucet.deleteOne({ _id: insertedId })
    return { ok: false, error: byWallet > FAUCET_WALLET_LIMIT ? FAUCET_WALLET_LIMIT_ERROR : FAUCET_IP_LIMIT_ERROR }
  }
  return { ok: true, id: insertedId }
}

export async function completeFaucet(cols: Collections, id: ObjectId, signature: string, lamports: number) {
  await cols.faucet.updateOne({ _id: id }, { $set: { status: 'sent', signature, lamports } })
}

export async function releaseFaucet(cols: Collections, id: ObjectId) {
  await cols.faucet.deleteOne({ _id: id })
}

export async function requestFaucet(
  cols: Collections,
  chain: ArenaChain,
  wallet: string,
  ip: string,
  now = Date.now(),
): Promise<FaucetResult> {
  const recipient = new PublicKey(wallet)
  const [balance, faucetBalance] = await Promise.all([
    chain.base.getBalance(recipient, 'confirmed'),
    chain.base.getBalance(chain.faucet.publicKey, 'confirmed'),
  ])
  if (balance >= FAUCET_MIN_BALANCE) return { skipped: true, balance }
  if (faucetBalance < FAUCET_LAMPORTS + FEE_BUFFER_LAMPORTS) throw new HttpError(503, 'Faucet is out of devnet SOL')

  const reservation = await reserveFaucet(cols, wallet, ip, now)
  if (!reservation.ok) throw new HttpError(429, reservation.error)

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: chain.faucet.publicKey, toPubkey: recipient, lamports: FAUCET_LAMPORTS }),
  )
  try {
    const signature = await chain.sendBaseTx(tx, [chain.faucet])
    await completeFaucet(cols, reservation.id, signature, FAUCET_LAMPORTS)
    console.log(`[faucet] sent ${FAUCET_LAMPORTS} lamports to ${wallet} sig=${signature}`)
    return { signature, lamports: FAUCET_LAMPORTS }
  } catch (error) {
    // A timed-out send may still land, so it keeps its reservation.
    if (error instanceof ChainTxError && error.timedOut && error.signature) {
      await completeFaucet(cols, reservation.id, error.signature, FAUCET_LAMPORTS)
    } else {
      await releaseFaucet(cols, reservation.id)
    }
    console.error(`[faucet] transfer to ${wallet} failed: ${errorMessage(error)}`)
    throw new HttpError(502, 'Faucet transfer failed; try again shortly')
  }
}
