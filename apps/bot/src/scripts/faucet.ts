import { formatEther, formatUnits, parseEther, parseUnits } from 'viem'
import { chain, createSignerClient, publicClient, tusdcAbi, tusdcAddress, writeGasEnvelope } from '@/chain'
import { errorMessage } from '@/lib/async'
import { getFaucetAccount, wallets, type BotWallet } from '@/wallets'

const STT_AMOUNT = parseEther('1')
const TUSDC_DECIMALS = 6
const TUSDC_AMOUNT = parseUnits('100', TUSDC_DECIMALS)
const GAS_RESERVE = parseEther('2')

type PendingTransfer = {
  index: number
  address: `0x${string}`
  asset: 'STT' | 'tUSDC'
  hash: `0x${string}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  }
}

async function tokenBalance(address: `0x${string}`) {
  return publicClient.readContract({
    address: tusdcAddress,
    abi: tusdcAbi,
    functionName: 'balanceOf',
    args: [address],
  })
}

async function needsFunding(wallet: BotWallet, force: boolean) {
  if (force) {
    return { stt: true, tusdc: true }
  }

  const [sttBalance, tusdcBalance] = await Promise.all([
    publicClient.getBalance({ address: wallet.address }),
    tokenBalance(wallet.address),
  ])

  return {
    stt: sttBalance < STT_AMOUNT,
    tusdc: tusdcBalance < TUSDC_AMOUNT,
  }
}

if (STT_AMOUNT < writeGasEnvelope) {
  throw new Error(
    `Faucet STT amount ${formatEther(STT_AMOUNT)} is below the SDK gas envelope ${formatEther(writeGasEnvelope)}`,
  )
}

const { dryRun, force } = parseArgs()
const faucet = getFaucetAccount()
const recipients = wallets()
const walletClient = createSignerClient(faucet)

const decimals = await publicClient.readContract({
  address: tusdcAddress,
  abi: tusdcAbi,
  functionName: 'decimals',
})

if (decimals !== TUSDC_DECIMALS) {
  throw new Error(`Expected tUSDC decimals ${TUSDC_DECIMALS}, got ${decimals}`)
}

const plans = await Promise.all(
  recipients.map(async (wallet) => {
    const needs = await needsFunding(wallet, force)
    return { wallet, needs }
  }),
)

const targets = plans.filter((plan) => plan.needs.stt || plan.needs.tusdc)
const sttTargets = targets.filter((plan) => plan.needs.stt).length
const tusdcTargets = targets.filter((plan) => plan.needs.tusdc).length
const sttNeeded = STT_AMOUNT * BigInt(sttTargets)
const tusdcNeeded = TUSDC_AMOUNT * BigInt(tusdcTargets)

const [faucetStt, faucetTusdc] = await Promise.all([
  publicClient.getBalance({ address: faucet.address }),
  tokenBalance(faucet.address),
])

console.log(`Faucet ${faucet.address} on ${chain.name} (${chain.id})`)
console.log(`  STT   ${formatEther(faucetStt)}`)
console.log(`  tUSDC ${formatUnits(faucetTusdc, TUSDC_DECIMALS)}  ${tusdcAddress}`)
console.log(
  `Wallets ${recipients.length}: send ${formatEther(STT_AMOUNT)} STT to ${sttTargets}, ${formatUnits(TUSDC_AMOUNT, TUSDC_DECIMALS)} tUSDC to ${tusdcTargets} (SDK gas envelope ${formatEther(writeGasEnvelope)} STT)`,
)

if (targets.length === 0) {
  console.log(
    `All wallets already have at least ${formatEther(STT_AMOUNT)} STT and ${formatUnits(TUSDC_AMOUNT, TUSDC_DECIMALS)} tUSDC.`,
  )
  process.exit(0)
}

if (faucetStt < sttNeeded + GAS_RESERVE) {
  throw new Error(
    `Faucet STT is too low. Need ${formatEther(sttNeeded)} + ${formatEther(GAS_RESERVE)} gas reserve, have ${formatEther(faucetStt)}.`,
  )
}

if (dryRun) {
  for (const { wallet, needs } of targets) {
    console.log(
      `  ${wallet.index.toString().padStart(3, ' ')}  ${wallet.address}  ${needs.stt ? `${formatEther(STT_AMOUNT)} STT` : '-'}  ${needs.tusdc ? `${formatUnits(TUSDC_AMOUNT, TUSDC_DECIMALS)} tUSDC` : '-'}`,
    )
  }
  console.log('Dry run only. Re-run without --dry-run to send.')
  process.exit(0)
}

if (faucetTusdc < tusdcNeeded) {
  const shortfall = tusdcNeeded - faucetTusdc
  console.log(`Minting ${formatUnits(shortfall, TUSDC_DECIMALS)} tUSDC to the faucet wallet`)
  const mintHash = await walletClient.writeContract({
    address: tusdcAddress,
    abi: tusdcAbi,
    functionName: 'faucet',
    args: [shortfall],
  })
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash })
  if (mintReceipt.status !== 'success') {
    throw new Error(`tUSDC faucet mint reverted: ${mintHash}`)
  }
}

let nonce = await publicClient.getTransactionCount({
  address: faucet.address,
  blockTag: 'pending',
})

const pending: PendingTransfer[] = []

for (const { wallet, needs } of targets) {
  if (needs.stt) {
    const hash = await walletClient.sendTransaction({
      to: wallet.address,
      value: STT_AMOUNT,
      nonce: nonce++,
    })
    pending.push({ index: wallet.index, address: wallet.address, asset: 'STT', hash })
    console.log(`  ${wallet.index.toString().padStart(3, ' ')}  STT    ${hash}`)
  }

  if (needs.tusdc) {
    const hash = await walletClient.writeContract({
      address: tusdcAddress,
      abi: tusdcAbi,
      functionName: 'transfer',
      args: [wallet.address, TUSDC_AMOUNT],
      nonce: nonce++,
    })
    pending.push({ index: wallet.index, address: wallet.address, asset: 'tUSDC', hash })
    console.log(`  ${wallet.index.toString().padStart(3, ' ')}  tUSDC  ${hash}`)
  }
}

const receipts = await Promise.all(
  pending.map(async (transfer) => {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transfer.hash })
      return { transfer, status: receipt.status }
    } catch (error) {
      return { transfer, status: 'error' as const, error }
    }
  }),
)

let failed = 0
for (const receipt of receipts) {
  if (receipt.status === 'success') continue
  failed += 1
  const reason = receipt.status === 'error' ? errorMessage(receipt.error) : receipt.status
  console.error(
    `  ${receipt.transfer.index.toString().padStart(3, ' ')}  ${receipt.transfer.asset} failed  ${receipt.transfer.hash}  ${reason}`,
  )
}

console.log(`Confirmed ${receipts.length - failed}/${receipts.length} transfers`)

if (failed > 0) {
  process.exit(1)
}
