import { Connection, PublicKey } from '@solana/web3.js'

import { BTC_USD_FEED, ORACLE_PROGRAM_ID, PRICE_UPDATE_DISCRIMINATOR } from './constants'

export type OraclePrice = {
  feed: string
  raw: bigint
  /** The republisher stores the exponent as a positive decimal count (8 for BTC/USD). */
  decimals: number
  price: number
  publishTime: number
  postedSlot: bigint
}

const MIN_LENGTH = 133

function readI64(view: DataView, offset: number) {
  return view.getBigInt64(offset, true)
}

/**
 * Decodes MagicBlock's PriceUpdateV2-layout oracle account and applies the same
 * checks as the on-chain reader (discriminator, feed id, republisher slot, positive price).
 */
export function decodePriceUpdate(feed: PublicKey, data: Uint8Array, owner?: PublicKey): OraclePrice {
  if (owner && !owner.equals(ORACLE_PROGRAM_ID)) throw new Error('Price feed is not owned by the MagicBlock oracle')
  if (data.length < MIN_LENGTH) throw new Error('Price feed account is too short')
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PRICE_UPDATE_DISCRIMINATOR[i]) throw new Error('Account is not a MagicBlock price update')
  }
  if (data[40] !== 1) throw new Error('Price update is not fully verified')
  const feedBytes = feed.toBytes()
  for (let i = 0; i < 32; i++) {
    if (data[41 + i] !== feedBytes[i]) throw new Error('Price update belongs to a different feed')
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const raw = readI64(view, 73)
  const exponent = view.getInt32(89, true)
  const publishTime = Number(readI64(view, 93))
  const postedSlot = view.getBigUint64(125, true)
  if (postedSlot === 0n) throw new Error('Price feed has not been published yet')
  if (raw <= 0n) throw new Error('Price feed reported a non-positive price')
  const decimals = Math.abs(exponent)
  return {
    feed: feed.toBase58(),
    raw,
    decimals,
    price: rawPriceToNumber(raw, decimals),
    publishTime,
    postedSlot,
  }
}

export function rawPriceToNumber(raw: bigint, decimals: number) {
  const scale = 10n ** BigInt(Math.abs(decimals))
  const whole = raw / scale
  const fraction = raw % scale
  return Number(whole) + Number(fraction) / Number(scale)
}

export async function fetchOraclePrice(erConnection: Connection, feed: PublicKey = BTC_USD_FEED) {
  const account = await erConnection.getAccountInfo(feed, 'confirmed')
  if (!account) throw new Error(`Price feed ${feed.toBase58()} was not found on the ephemeral rollup`)
  return decodePriceUpdate(feed, account.data, account.owner)
}

/**
 * Streams price updates from the ER account subscription, dropping updates whose
 * posted slot did not advance. Returns an unsubscribe function.
 */
export function subscribeOraclePrice(
  erConnection: Connection,
  onPrice: (price: OraclePrice) => void,
  onError: (error: Error) => void,
  feed: PublicKey = BTC_USD_FEED,
) {
  let lastSlot = -1n
  let disposed = false
  const deliver = (price: OraclePrice) => {
    if (disposed || price.postedSlot <= lastSlot) return
    lastSlot = price.postedSlot
    onPrice(price)
  }
  fetchOraclePrice(erConnection, feed)
    .then(deliver)
    .catch((error: unknown) => onError(error instanceof Error ? error : new Error(String(error))))
  const id = erConnection.onAccountChange(
    feed,
    (account) => {
      try {
        deliver(decodePriceUpdate(feed, account.data, account.owner))
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    },
    { commitment: 'confirmed' },
  )
  return () => {
    disposed = true
    void erConnection.removeAccountChangeListener(id)
  }
}
