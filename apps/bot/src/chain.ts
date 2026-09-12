import { DEFAULT_FEES, SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'
import { createPublicClient, createWalletClient, http, parseAbi, type Account } from 'viem'

export const chain = somniaShannon

// The SDK writer does not export DEFAULT_GAS. It signs every write (including
// ERC-20 approve) with a 10M gas ceiling × 60 gwei, so the mempool requires a
// 0.6 STT envelope even though unused gas is refunded.
export const writeGasLimit = 10_000_000n
export const writeGasEnvelope = writeGasLimit * DEFAULT_FEES.maxFeePerGas

export const tusdcAddress = (SOMNIA_TESTNET_ADDRESSES.testUsdc ??
  '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E') as `0x${string}`

export const tusdcAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function faucet(uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

export const publicClient = createPublicClient({
  chain,
  transport: http(),
})

export function createSignerClient(account: Account) {
  return createWalletClient({
    account,
    chain,
    transport: http(),
  })
}
