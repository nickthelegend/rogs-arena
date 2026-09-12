import privy from '@/lib/privy'
import { type LinkedAccount, type User, type Wallet } from '@privy-io/node'
import { createHash } from 'crypto'
import { isAddress } from 'viem'

type PrivyEthereumWallet = {
  id?: string
  address: string
  chain_type: 'ethereum'
}

type AuthorizedWalletCacheEntry = {
  user: User
  wallet: PrivyEthereumWallet | Wallet
  expiresAt: number
}

const authorizedWalletCache = new Map<string, AuthorizedWalletCacheEntry>()
const authorizedWalletCacheTtlMs = 30_000
const authorizedWalletCacheMaxEntries = 200

export class TradingApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public context: Record<string, unknown> = {}
  ) {
    super(message)
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  return authorization.slice('Bearer '.length).trim()
}

function cacheKey(userId: string, walletId: string, accessToken: string) {
  const tokenHash = createHash('sha256').update(accessToken).digest('hex').slice(0, 16)

  return `${userId}:${walletId}:${tokenHash}`
}

function cachedAuthorizedWallet(userId: string, walletId: string, accessToken: string) {
  const key = cacheKey(userId, walletId, accessToken)
  const cached = authorizedWalletCache.get(key)

  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    authorizedWalletCache.delete(key)
    return null
  }

  return cached
}

function pruneAuthorizedWalletCache() {
  if (authorizedWalletCache.size < authorizedWalletCacheMaxEntries) return

  const now = Date.now()
  for (const [key, entry] of authorizedWalletCache) {
    if (entry.expiresAt <= now) {
      authorizedWalletCache.delete(key)
    }
  }

  while (authorizedWalletCache.size >= authorizedWalletCacheMaxEntries) {
    const oldestKey = authorizedWalletCache.keys().next().value
    if (!oldestKey) break
    authorizedWalletCache.delete(oldestKey)
  }
}

function cacheAuthorizedWallet({
  userId,
  walletId,
  accessToken,
  tokenExpiration,
  user,
  wallet,
}: {
  userId: string
  walletId: string
  accessToken: string
  tokenExpiration: number
  user: User
  wallet: PrivyEthereumWallet | Wallet
}) {
  const expiresAt = Math.min(Date.now() + authorizedWalletCacheTtlMs, tokenExpiration * 1000)

  if (expiresAt <= Date.now()) return

  pruneAuthorizedWalletCache()
  authorizedWalletCache.set(cacheKey(userId, walletId, accessToken), {
    user,
    wallet,
    expiresAt,
  })
}

function isOwnedEthereumEmbeddedWallet(account: LinkedAccount, walletId: string, walletAddress: string) {
  if (account.type !== 'wallet') return false
  if (!('chain_type' in account) || account.chain_type !== 'ethereum') return false
  if (!('connector_type' in account) || account.connector_type !== 'embedded') return false
  if (!('wallet_client_type' in account) || account.wallet_client_type !== 'privy') return false
  if (account.address.toLowerCase() !== walletAddress.toLowerCase()) return false

  const linkedWalletId = 'id' in account ? account.id : null
  return !linkedWalletId || linkedWalletId === walletId
}

function linkedEthereumEmbeddedWallet(account: LinkedAccount, walletId: string): PrivyEthereumWallet | null {
  if (account.type !== 'wallet') return null
  if (!('chain_type' in account) || account.chain_type !== 'ethereum') return null
  if (!('connector_type' in account) || account.connector_type !== 'embedded') return null
  if (!('wallet_client_type' in account) || account.wallet_client_type !== 'privy') return null
  if (!isAddress(account.address)) return null

  const linkedWalletId = 'id' in account ? account.id : null
  if (linkedWalletId !== walletId) return null

  return {
    id: linkedWalletId,
    address: account.address,
    chain_type: 'ethereum',
  }
}

export async function requirePrivyEthereumWallet(
  request: Request,
  walletId: string
): Promise<{ user: User; wallet: PrivyEthereumWallet | Wallet }> {
  const accessToken = bearerToken(request)

  if (!accessToken) {
    throw new TradingApiError('Missing Privy access token', 401)
  }

  let userId: string
  let tokenExpiration: number
  try {
    const verified = await privy.utils().auth().verifyAccessToken(accessToken)
    userId = verified.user_id
    tokenExpiration = verified.expiration
  } catch {
    throw new TradingApiError('Invalid Privy access token', 401)
  }

  const cached = cachedAuthorizedWallet(userId, walletId, accessToken)
  if (cached) {
    console.info('[privy-auth] authorized wallet cache hit', {
      userId,
      walletId,
    })
    return {
      user: cached.user,
      wallet: cached.wallet,
    }
  }

  console.info('[privy-auth] authorized wallet cache miss', {
    userId,
    walletId,
  })

  const user = await privy.users()._get(userId)
  const linkedWallet = user.linked_accounts
    .map((account) => linkedEthereumEmbeddedWallet(account, walletId))
    .find((account) => account !== null)

  if (linkedWallet) {
    cacheAuthorizedWallet({
      userId,
      walletId,
      accessToken,
      tokenExpiration,
      user,
      wallet: linkedWallet,
    })
    return { user, wallet: linkedWallet }
  }

  const wallet = await privy.wallets().get(walletId)

  if (wallet.chain_type !== 'ethereum') {
    throw new TradingApiError('Wallet is not an Ethereum wallet', 400, {
      walletId,
      chainType: wallet.chain_type,
    })
  }

  if (!isAddress(wallet.address)) {
    throw new TradingApiError('Wallet address is not a valid EVM address', 400, {
      walletId,
      address: wallet.address,
    })
  }

  const walletAddress = wallet.address
  const ownsWallet = user.linked_accounts.some((account) =>
    isOwnedEthereumEmbeddedWallet(account, walletId, walletAddress)
  )

  if (!ownsWallet) {
    throw new TradingApiError('Wallet is not linked to the authenticated Privy user', 403, {
      walletId,
      userId,
    })
  }

  cacheAuthorizedWallet({
    userId,
    walletId,
    accessToken,
    tokenExpiration,
    user,
    wallet,
  })

  return { user, wallet }
}
