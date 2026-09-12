import { publicClient, tusdcAbi, tusdcAddress } from '@/chain'
import type { BotWallet } from '@/wallets'
import type { SomniaMarkets } from '@somnia-chain/markets-sdk'
import { formatUnits } from 'viem'
import type { WalletPositions } from './types'

export const defaultBatchSize = 4
export const maxBatchSize = 12

function humanAmount(raw: bigint, decimals: number) {
  return Number(formatUnits(raw, decimals))
}

export function pickBatchSize(max: number, random = Math.random) {
  const cap = Math.max(1, Math.min(Math.floor(max), maxBatchSize))
  return 1 + Math.floor(random() * cap)
}

export function pickBatch(roster: BotWallet[], size: number, last?: BotWallet, reuseLast = false) {
  const count = Math.max(1, Math.min(size, roster.length, maxBatchSize))
  const picked: BotWallet[] = []
  const seen = new Set<string>()

  if (reuseLast && last) {
    picked.push(last)
    seen.add(last.address.toLowerCase())
  }

  const pool = roster.filter((wallet) => !seen.has(wallet.address.toLowerCase()))
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    const wallet = pool.splice(index, 1)[0]
    if (!wallet) break
    picked.push(wallet)
  }

  return picked
}

export async function walletCollaterals(addresses: `0x${string}`[], decimals: number) {
  if (addresses.length === 0) return []

  const rows = await publicClient.multicall({
    contracts: addresses.map((address) => ({
      address: tusdcAddress,
      abi: tusdcAbi,
      functionName: 'balanceOf' as const,
      args: [address] as const,
    })),
    allowFailure: true,
  })

  return rows.map((row) => (row.status === 'success' ? humanAmount(row.result, decimals) : 0))
}

export async function loadPositions(
  exchange: SomniaMarkets,
  addresses: `0x${string}`[],
  marketId: string,
  decimals: number,
): Promise<WalletPositions[]> {
  const [collaterals, pnls] = await Promise.all([
    walletCollaterals(addresses, decimals),
    Promise.all(addresses.map((address) => exchange.client.getBinaryPositionPnL(address, marketId).catch(() => null))),
  ])

  return addresses.map((_, index) => {
    const pnl = pnls[index]
    return {
      yes: pnl ? humanAmount(pnl.balanceYes, decimals) : 0,
      no: pnl ? humanAmount(pnl.balanceNo, decimals) : 0,
      collateral: collaterals[index] ?? 0,
      unrealizedPnl: pnl ? humanAmount(pnl.unrealizedPnl, decimals) : undefined,
    }
  })
}
