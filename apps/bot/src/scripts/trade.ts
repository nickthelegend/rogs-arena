import { closeFirebase } from '@/firebase'
import { defaultInterval, intervalOptions, isIntervalOption, type IntervalOption } from '@/market'
import { simulateTrades } from '@/trade'
import { defaultBatchSize, maxBatchSize } from '@/trade/batch'
import { defaultPaceMs } from '@/trade/pace'
import { maxTradeCost, minTradeCost } from '@/trade/types'
import { setTradersOffline, setTradersOnline } from '@/traders-store'
import { wallets } from '@/wallets'

function parseArgs() {
  const args = process.argv.slice(2)
  const countFlag = args.indexOf('--count')
  const intervalFlag = args.indexOf('--interval')
  const windowFlag = args.indexOf('--window')
  const limitFlag = args.indexOf('--limit')
  const batchFlag = args.indexOf('--batch')
  const rawCount = countFlag >= 0 ? args[countFlag + 1] : undefined
  const rawInterval = intervalFlag >= 0 ? args[intervalFlag + 1] : undefined
  const rawWindow = windowFlag >= 0 ? args[windowFlag + 1] : undefined
  const rawLimit = limitFlag >= 0 ? args[limitFlag + 1] : undefined
  const rawBatch = batchFlag >= 0 ? args[batchFlag + 1] : undefined
  const count = rawCount ? Number(rawCount) : undefined
  const intervalMs = rawInterval ? Number(rawInterval) : defaultPaceMs
  const window = rawWindow ?? defaultInterval
  const limit = rawLimit ? Number(rawLimit) : maxTradeCost
  const batch = rawBatch ? Number(rawBatch) : defaultBatchSize

  if (rawCount !== undefined && (!Number.isInteger(count) || !count || count <= 0)) {
    throw new Error(`--count must be a positive integer, got: ${rawCount}`)
  }

  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error(`--interval must be a non-negative integer, got: ${rawInterval}`)
  }

  if (!isIntervalOption(window)) {
    throw new Error(`--window must be one of ${intervalOptions.join(', ')}, got: ${rawWindow}`)
  }

  if (!Number.isFinite(limit) || limit <= minTradeCost) {
    throw new Error(`--limit must be greater than ${minTradeCost}, got: ${rawLimit}`)
  }

  if (!Number.isInteger(batch) || !batch || batch <= 0 || batch > maxBatchSize) {
    throw new Error(`--batch must be a max cap from 1 to ${maxBatchSize}, got: ${rawBatch}`)
  }

  return {
    count,
    intervalMs,
    window: window as IntervalOption,
    limit,
    batch,
    dryRun: args.includes('--dry-run'),
  }
}

const { count, intervalMs, window, limit, batch, dryRun } = parseArgs()
const controller = new AbortController()
const roster = wallets()

process.on('SIGINT', () => controller.abort())
process.on('SIGTERM', () => controller.abort())

console.log(
  `Trading BTC ${window} from ${process.env.WALLET_COUNT} wallets · cost ${minTradeCost}–${limit} · batch 1–${batch} · natural pace ~${Math.round(intervalMs / 1000)}s${dryRun ? ' [dry-run]' : ''}`,
)

try {
  await setTradersOnline(roster, { dryRun })
  const placed = await simulateTrades({
    count,
    intervalMs,
    dryRun,
    window,
    cost: { limit },
    batch,
    signal: controller.signal,
  })
  console.log(`Placed ${placed} trades`)
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
