import { env, walletAddress, walletPrivateKey } from '@/env'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

export type BotWallet = {
  index: number
  address: `0x${string}`
  privateKey: `0x${string}`
  account: PrivateKeyAccount
}

export function getFaucetAccount() {
  return privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`)
}

function loadWallets(): BotWallet[] {
  return Array.from({ length: env.WALLET_COUNT }, (_, index) => {
    const privateKey = walletPrivateKey(index)
    const storedAddress = walletAddress(index)
    const account = privateKeyToAccount(privateKey)

    if (storedAddress && storedAddress.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error(`WALLET_${index}_ADDRESS does not match WALLET_${index}_PRIVATE_KEY`)
    }

    return {
      index,
      address: account.address,
      privateKey,
      account,
    }
  })
}

let cached: BotWallet[] | undefined

export function wallets(): BotWallet[] {
  cached ??= loadWallets()
  return cached
}

export function getWallet(index: number): BotWallet {
  const wallet = wallets()[index]
  if (!wallet) {
    throw new Error(`No wallet at index ${index}`)
  }
  return wallet
}
