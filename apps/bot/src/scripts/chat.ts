import { CHAT_LIMIT, simulateChat } from '@/chat'
import { closeFirebase } from '@/firebase'
import { setTradersOffline, setTradersOnline } from '@/traders-store'
import { wallets } from '@/wallets'

function parseArgs() {
  const args = process.argv.slice(2)
  const countFlag = args.indexOf('--count')
  const intervalFlag = args.indexOf('--interval')
  const rawCount = countFlag >= 0 ? args[countFlag + 1] : undefined
  const rawInterval = intervalFlag >= 0 ? args[intervalFlag + 1] : undefined
  const count = rawCount ? Number(rawCount) : undefined
  const intervalMs = rawInterval ? Number(rawInterval) : 1_500

  if (rawCount !== undefined && (!Number.isInteger(count) || !count || count <= 0)) {
    throw new Error(`--count must be a positive integer, got: ${rawCount}`)
  }

  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error(`--interval must be a non-negative integer, got: ${rawInterval}`)
  }

  return {
    count,
    intervalMs,
    dryRun: args.includes('--dry-run'),
  }
}

const { count, intervalMs, dryRun } = parseArgs()
const controller = new AbortController()
const roster = wallets()

process.on('SIGINT', () => controller.abort())
process.on('SIGTERM', () => controller.abort())

console.log(
  `Simulating chat from ${process.env.WALLET_COUNT} wallets → /chat (limit ${CHAT_LIMIT})${dryRun ? ' [dry-run]' : ''}`,
)

try {
  await setTradersOnline(roster, { dryRun })
  const sent = await simulateChat({
    count,
    intervalMs,
    dryRun,
    signal: controller.signal,
  })
  console.log(`Sent ${sent} messages`)
} catch (error) {
  if (controller.signal.aborted) {
    console.log('Stopped')
  } else {
    throw error
  }
} finally {
  await setTradersOffline(roster, { dryRun })
  await closeFirebase()
}
