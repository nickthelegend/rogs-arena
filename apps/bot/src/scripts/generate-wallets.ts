import { resolve } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const DEFAULT_COUNT = 100
const ENV_PATH = resolve(import.meta.dir, '../../.env')
const WALLET_BLOCK_START = '# --- generated wallets ---'

type GeneratedWallet = {
  index: number
  address: `0x${string}`
  privateKey: `0x${string}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const countFlag = args.indexOf('--count')
  const rawCount = countFlag >= 0 ? args[countFlag + 1] : undefined
  const count = rawCount ? Number(rawCount) : DEFAULT_COUNT

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`--count must be a positive integer, got: ${rawCount}`)
  }

  return { force, count }
}

function isWalletEnvLine(line: string) {
  const trimmed = line.trim()
  return (
    trimmed === WALLET_BLOCK_START ||
    trimmed.startsWith('# Wallet ') ||
    /^WALLET_(COUNT|\d+_(ADDRESS|PRIVATE_KEY))=/.test(trimmed)
  )
}

function stripGeneratedWallets(content: string) {
  const others: string[] = []
  let walletsExist = false

  for (const line of content.split('\n')) {
    if (isWalletEnvLine(line)) {
      walletsExist = true
      continue
    }
    others.push(line)
  }

  while (others.length > 0 && others[others.length - 1]?.trim() === '') {
    others.pop()
  }

  return { others, walletsExist }
}

function generateWallets(count: number): GeneratedWallet[] {
  return Array.from({ length: count }, (_, index) => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    return { index, address: account.address, privateKey }
  })
}

function renderWalletBlock(wallets: GeneratedWallet[]) {
  const lines = [WALLET_BLOCK_START, `WALLET_COUNT=${wallets.length}`, '']

  for (const wallet of wallets) {
    lines.push(`# Wallet ${wallet.index}`)
    lines.push(`WALLET_${wallet.index}_ADDRESS=${wallet.address}`)
    lines.push(`WALLET_${wallet.index}_PRIVATE_KEY=${wallet.privateKey}`)
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

const { force, count } = parseArgs()
const envFile = Bun.file(ENV_PATH)
const existing = (await envFile.exists()) ? await envFile.text() : ''
const { others, walletsExist } = stripGeneratedWallets(existing)

if (walletsExist && !force) {
  throw new Error(`Wallets already exist in ${ENV_PATH}. Re-run with --force to replace them.`)
}

const wallets = generateWallets(count)
const nextContent = `${others.join('\n')}\n\n${renderWalletBlock(wallets)}`

await Bun.write(ENV_PATH, nextContent)

console.log(`Wrote ${wallets.length} wallets to ${ENV_PATH}`)
console.log('Addresses:')
for (const wallet of wallets) {
  console.log(`  ${wallet.index.toString().padStart(3, ' ')}  ${wallet.address}`)
}
