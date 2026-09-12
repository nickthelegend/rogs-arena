import { claimRewards, printClaimRows } from '@/claim'
import { defaultInterval, intervalOptions, isIntervalOption, type IntervalOption } from '@/market'

function parseArgs() {
  const args = process.argv.slice(2)
  const windowFlag = args.indexOf('--window')
  const marketFlag = args.indexOf('--market')
  const rawWindow = windowFlag >= 0 ? args[windowFlag + 1] : undefined
  const marketId = marketFlag >= 0 ? args[marketFlag + 1] : undefined
  const window = rawWindow ?? defaultInterval

  if (rawWindow !== undefined && !isIntervalOption(window)) {
    throw new Error(`--window must be one of ${intervalOptions.join(', ')}, got: ${rawWindow}`)
  }

  if (marketFlag >= 0 && !marketId) {
    throw new Error('--market needs a market id')
  }

  return {
    window: window as IntervalOption,
    marketId,
    dryRun: args.includes('--dry-run'),
    all: args.includes('--all'),
  }
}

const { window, marketId, dryRun, all } = parseArgs()
const scope = marketId ? marketId : all ? 'all settled markets' : `BTC ${window}`

console.log(`Claiming rewards from ${process.env.WALLET_COUNT} wallets · ${scope}${dryRun ? ' [dry-run]' : ''}`)

const rows = await claimRewards({
  window,
  marketId,
  dryRun,
  all,
})

printClaimRows(rows)

const claimed = rows.filter((row) => row.claimed === 'yes' || row.claimed === 'dry').length
const failed = rows.filter((row) => row.claimed === 'fail').length
console.log(`Claimed ${claimed}/${rows.length}${failed ? ` · ${failed} failed` : ''}`)
