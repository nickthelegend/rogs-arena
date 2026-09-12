import '@/env'
import { parseWatcherArgs } from '@/cli'
import { Dashboard } from '@/ui/dashboard'
import { render } from 'ink'

function watcherArgs() {
  try {
    return parseWatcherArgs()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

const { interval } = watcherArgs()
const isInteractive = Boolean(process.stdin.isTTY)
const app = render(<Dashboard interval={interval} />, {
  exitOnCtrlC: isInteractive,
  stdin: process.stdin,
})
await app.waitUntilExit()

