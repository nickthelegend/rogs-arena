import { errorMessage } from '@/lib/error'
import { Keypair, type PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'

// A devnet-only guest key kept in this browser. It is a throwaway identity for the arena, never a real wallet.
export const GUEST_STORAGE_KEY = 'rogs.guest'

export type GuestStorage = Pick<Storage, 'getItem' | 'setItem'>

type SolanaTransaction = Transaction | VersionedTransaction

export type GuestWallet = {
  publicKey: PublicKey
  signTransaction<T extends SolanaTransaction>(transaction: T): Promise<T>
  signAllTransactions<T extends SolanaTransaction>(transactions: T[]): Promise<T[]>
  signMessage(message: Uint8Array): Promise<Uint8Array>
}

function isVersioned(transaction: SolanaTransaction): transaction is VersionedTransaction {
  return 'version' in transaction
}

function signWith<T extends SolanaTransaction>(keypair: Keypair, transaction: T): T {
  if (isVersioned(transaction)) transaction.sign([keypair])
  else transaction.partialSign(keypair)
  return transaction
}

export function guestWalletFromKeypair(keypair: Keypair): GuestWallet {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(transaction) {
      return signWith(keypair, transaction)
    },
    async signAllTransactions(transactions) {
      return transactions.map((transaction) => signWith(keypair, transaction))
    },
    async signMessage(message) {
      return nacl.sign.detached(message, keypair.secretKey)
    },
  }
}

function browserStorage(): GuestStorage {
  if (typeof window === 'undefined') throw new Error('The guest wallet only runs in the browser.')
  try {
    return window.localStorage
  } catch (error) {
    throw new Error(`The guest wallet needs browser storage: ${errorMessage(error)}`)
  }
}

export function readGuestKeypair(storage: GuestStorage = browserStorage()): Keypair | null {
  const raw = storage.getItem(GUEST_STORAGE_KEY)
  if (!raw) return null

  let secret: Uint8Array
  try {
    secret = bs58.decode(raw)
  } catch {
    throw new Error(`The saved guest key (${GUEST_STORAGE_KEY}) is not valid base58.`)
  }
  if (secret.length !== 64) {
    throw new Error(`The saved guest key (${GUEST_STORAGE_KEY}) has ${secret.length} bytes; expected 64.`)
  }

  try {
    return Keypair.fromSecretKey(secret)
  } catch (error) {
    throw new Error(`The saved guest key (${GUEST_STORAGE_KEY}) is invalid: ${errorMessage(error)}`)
  }
}

export function loadGuestWallet(storage: GuestStorage = browserStorage()): GuestWallet | null {
  const keypair = readGuestKeypair(storage)
  return keypair ? guestWalletFromKeypair(keypair) : null
}

export function loadOrCreateGuestWallet(storage: GuestStorage = browserStorage()): GuestWallet {
  const existing = readGuestKeypair(storage)
  if (existing) return guestWalletFromKeypair(existing)

  const keypair = Keypair.generate()
  storage.setItem(GUEST_STORAGE_KEY, bs58.encode(keypair.secretKey))
  return guestWalletFromKeypair(keypair)
}
