import { formatUnits } from 'viem'
import { chain, publicClient, tusdcAbi, tusdcAddress } from '@/chain'
import { getFaucetAccount, wallets, type BotWallet } from '@/wallets'

const TUSDC_DECIMALS = 6

type Balances = {
  stt: bigint
  tusdc: bigint
}

function parseArgs() {
  const args = process.argv.slice(2)
  const indexFlag = args.indexOf('--index')
  const rawIndex = indexFlag >= 0 ? args[indexFlag + 1] : undefined
  const index = rawIndex === undefined ? undefined : Number(rawIndex)

  if (rawIndex !== undefined && (!Number.isInteger(index) || index === undefined || index < 0)) {
    throw new Error(`--index must be a non-negative integer, got: ${rawIndex}`)
  }

  return { index }
}

function padIndex(index: number) {
  return index.toString().padStart(6, ' ')
}

function formatAmount(value: bigint, decimals: number, width: number) {
  const [whole, fraction = ''] = formatUnits(value, decimals).split('.')
  const maxFraction = Math.min(decimals, 6)
  const trimmed = (fraction.replace(/0+$/, '') || '0').slice(0, maxFraction)
  return `${whole}.${trimmed}`.padStart(width, ' ')
}

async function tokenBalances(addresses: `0x${string}`[]) {
  if (addresses.length === 0) return []

  return publicClient.multicall({
    contracts: addresses.map((address) => ({
      address: tusdcAddress,
      abi: tusdcAbi,
      functionName: 'balanceOf' as const,
      args: [address] as const,
    })),
    allowFailure: false,
  })
}

async function loadBalances(addresses: `0x${string}`[]): Promise<Balances[]> {
  const [stt, tusdc] = await Promise.all([
    Promise.all(addresses.map((address) => publicClient.getBalance({ address }))),
    tokenBalances(addresses),
  ])

  return addresses.map((_, index) => ({
    stt: stt[index] ?? 0n,
    tusdc: tusdc[index] ?? 0n,
  }))
}

function printRow(label: string, address: `0x${string}`, balances: Balances) {
  console.log(
    `  ${label}  ${address}  ${formatAmount(balances.stt, 18, 18)} STT  ${formatAmount(balances.tusdc, TUSDC_DECIMALS, 14)} tUSDC`,
  )
}

const { index } = parseArgs()
const roster = wallets()
if (roster.length === 0) {
  throw new Error('No generated wallets. Run `bun run generate-wallets` first.')
}

let selected: BotWallet[] = roster
if (index !== undefined) {
  const wallet = roster[index]
  if (!wallet) {
    throw new Error(`No wallet at index ${index}. WALLET_COUNT=${roster.length}`)
  }
  selected = [wallet]
}

const decimals = await publicClient.readContract({
  address: tusdcAddress,
  abi: tusdcAbi,
  functionName: 'decimals',
})

if (decimals !== TUSDC_DECIMALS) {
  throw new Error(`Expected tUSDC decimals ${TUSDC_DECIMALS}, got ${decimals}`)
}

const faucet = getFaucetAccount()
const addresses = [faucet.address, ...selected.map((wallet) => wallet.address)]
const [faucetBalances, ...walletBalances] = await loadBalances(addresses)

if (!faucetBalances) {
  throw new Error('Failed to load faucet balances')
}

const totals = walletBalances.reduce(
  (acc, row) => ({
    stt: acc.stt + (row?.stt ?? 0n),
    tusdc: acc.tusdc + (row?.tusdc ?? 0n),
  }),
  { stt: 0n, tusdc: 0n },
)

console.log(`Wallets on ${chain.name} (${chain.id})`)
console.log(`  tUSDC ${tusdcAddress}`)
printRow('faucet', faucet.address, faucetBalances)
console.log(`Generated ${selected.length}/${roster.length}`)

for (const [offset, wallet] of selected.entries()) {
  const balances = walletBalances[offset]
  if (!wallet || !balances) continue
  printRow(padIndex(wallet.index), wallet.address, balances)
}

if (selected.length > 1) {
  console.log(`Total ${selected.length} wallets`)
  console.log(`  STT   ${formatUnits(totals.stt, 18)}`)
  console.log(`  tUSDC ${formatUnits(totals.tusdc, TUSDC_DECIMALS)}`)
}
