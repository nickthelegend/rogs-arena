import { CHAT_LIMIT, simulateChat } from '@/chat'
import { env } from '@/env'
import { closeFirebase } from '@/firebase'
import { type IntervalOption } from '@/market'
import { simulateTrades } from '@/trade'
import { minTradeCost } from '@/trade/types'
import { HEART_RATE_MS } from '@/traders'
import { setTradersOffline, setTradersOnline } from '@/traders-store'
import { errorMessage } from '@/lib/async'
import { wallets } from '@/wallets'

const DRY_RUN = false

const CHAT = {
  intervalMs: 1_500,
  count: undefined as number | undefined,
}

const TRADE = {
  intervalMs: 200,
  window: '5m' satisfies IntervalOption,
  limit: 5,
  batch: 2,
  count: undefined as number | undefined,
}

const controller = new AbortController()

process.on('SIGINT', () => controller.abort())
process.on('SIGTERM', () => controller.abort())

const roster = wallets()

console.log(
  `Orchestra · ${env.WALLET_COUNT} wallets${DRY_RUN ? ' [dry-run]' : ''}\n` +
    `  traders ${roster.length} → /traders\n` +
    `  hearts  every ${HEART_RATE_MS}ms → /traders\n` +
    `  chat   every ~${CHAT.intervalMs}ms → /chat (limit ${CHAT_LIMIT})\n` +
    `  trade  BTC ${TRADE.window} · cost ${minTradeCost}–${TRADE.limit} · batch 1–${TRADE.batch} · pace ${TRADE.intervalMs}ms`,
)

async function part(label: string, work: () => Promise<void>) {
  try {
    await work()
  } catch (error) {
    if (controller.signal.aborted) return
    console.error(`${label} stopped. ${errorMessage(error)}`)
  }
}

try {
  await setTradersOnline(roster, { dryRun: DRY_RUN })
  console.log(`Traders online ${roster.length}`)

  await Promise.all([
    part('chat', async () => {
      const sent = await simulateChat({
        count: CHAT.count,
        intervalMs: CHAT.intervalMs,
        dryRun: DRY_RUN,
        signal: controller.signal,
      })
      console.log(`Sent ${sent} messages`)
    }),
    part('trade', async () => {
      const placed = await simulateTrades({
        count: TRADE.count,
        intervalMs: TRADE.intervalMs,
        dryRun: DRY_RUN,
        window: TRADE.window as IntervalOption,
        cost: { limit: TRADE.limit },
        batch: TRADE.batch,
        signal: controller.signal,
      })
      console.log(`Placed ${placed} trades`)
    }),
  ])

  if (controller.signal.aborted) console.log('Stopped')
} finally {
  await setTradersOffline(roster, { dryRun: DRY_RUN })
  await closeFirebase()
}
