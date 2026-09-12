import { env } from '@/env'
import { publicClient } from '@/lib/viem'
import { TUSDC_DECIMALS } from '@/lib/trade-setup'
import { SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'
import { createWalletClient, formatUnits, http, parseAbi, parseUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const testUsdcAddress = SOMNIA_TESTNET_ADDRESSES.testUsdc as Address
const testUsdcAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function faucet(uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

export type AdminTusdcTransfer = {
  to: Address
  amount: string
}

export type AdminTusdcReceipt = {
  to: Address
  amount: string
  hash: `0x${string}`
}

function adminWallet() {
  const account = privateKeyToAccount(env.SOMNIA_PRIVATE_KEY as `0x${string}`)
  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: somniaShannon,
      transport: http(),
    }),
  }
}

export async function sendTusdcFromAdmin(transfers: AdminTusdcTransfer[]): Promise<AdminTusdcReceipt[]> {
  const pending = transfers.filter((transfer) => Number(transfer.amount) > 0)
  if (pending.length === 0) return []

  const { account, walletClient } = adminWallet()
  const rawAmounts = pending.map((transfer) => ({
    ...transfer,
    rawAmount: parseUnits(transfer.amount, TUSDC_DECIMALS),
  }))
  const total = rawAmounts.reduce((sum, transfer) => sum + transfer.rawAmount, BigInt(0))
  const adminBalance = await publicClient.readContract({
    address: testUsdcAddress,
    abi: testUsdcAbi,
    functionName: 'balanceOf',
    args: [account.address],
  })

  if (adminBalance < total) {
    const mintHash = await walletClient.writeContract({
      address: testUsdcAddress,
      abi: testUsdcAbi,
      functionName: 'faucet',
      args: [total - adminBalance],
    })
    await publicClient.waitForTransactionReceipt({ hash: mintHash })
  }

  const receipts: AdminTusdcReceipt[] = []
  for (const transfer of rawAmounts) {
    const hash = await walletClient.writeContract({
      address: testUsdcAddress,
      abi: testUsdcAbi,
      functionName: 'transfer',
      args: [transfer.to, transfer.rawAmount],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    receipts.push({
      to: transfer.to,
      amount: formatUnits(transfer.rawAmount, TUSDC_DECIMALS),
      hash,
    })
  }

  return receipts
}
