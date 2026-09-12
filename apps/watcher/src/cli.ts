import { defaultInterval, intervalOptions, isIntervalOption, type IntervalOption } from '@/config'

export type WatcherArgs = {
  interval: IntervalOption
}

const intervalHelp = intervalOptions.join(', ')

export function parseWatcherArgs(argv = process.argv.slice(2)): WatcherArgs {
  const flagIndex = argv.findIndex((arg) => arg === '--interval' || arg.startsWith('--interval='))
  if (flagIndex < 0) return { interval: defaultInterval }

  const flagged = argv[flagIndex]
  const raw = flagged?.startsWith('--interval=') ? flagged.slice('--interval='.length) : argv[flagIndex + 1]

  if (!raw || raw.startsWith('-')) {
    throw new Error(`--interval must be one of ${intervalHelp}`)
  }

  if (!isIntervalOption(raw)) {
    throw new Error(`--interval must be one of ${intervalHelp}, got: ${raw}`)
  }

  return { interval: raw }
}
