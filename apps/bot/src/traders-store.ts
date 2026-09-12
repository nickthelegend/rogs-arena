import { database, tradersRef } from '@/firebase'
import {
  botSessionId,
  createBotHeart,
  HEART_RATE_MS,
  nextBotHeartRate,
  PRESENCE_HEARTBEAT_MS,
  TRADERS_PATH,
  traderHeartRateClears,
  traderHeartRateUpdates,
  traderKey,
  traderPresenceUpdates,
  type BotHeart,
  type TraderStatus,
} from '@/traders'
import type { BotWallet } from '@/wallets'
import { onDisconnect, ref, update } from 'firebase/database'

let heartbeat: ReturnType<typeof setInterval> | undefined
let heartRate: ReturnType<typeof setInterval> | undefined
let heartbeatRoster: Pick<BotWallet, 'index' | 'address'>[] = []
const hearts = new Map<string, BotHeart>()

function heartKey(wallet: Pick<BotWallet, 'address'>) {
  return traderKey(wallet.address)
}

function ensureHearts(roster: Pick<BotWallet, 'index' | 'address'>[]) {
  for (const wallet of roster) {
    const key = heartKey(wallet)
    if (!hearts.has(key)) hearts.set(key, createBotHeart(wallet.index))
  }
}

function tickHearts(roster: Pick<BotWallet, 'index' | 'address'>[]) {
  ensureHearts(roster)
  for (const wallet of roster) {
    const key = heartKey(wallet)
    hearts.set(key, nextBotHeartRate(hearts.get(key) ?? createBotHeart(wallet.index)))
  }
}

export async function publishTraders(
  roster: Pick<BotWallet, 'index' | 'address'>[],
  status: TraderStatus,
  options: { dryRun?: boolean } = {},
) {
  if (status === 'online') ensureHearts(roster)
  const updates = traderPresenceUpdates(roster, status, Date.now(), {
    sessionId: botSessionId(),
    hearts: status === 'online' ? hearts : undefined,
  })
  if (options.dryRun) return { updates, written: false }

  await update(tradersRef, updates)
  return { updates, written: true }
}

async function publishHeartRates(
  roster: Pick<BotWallet, 'index' | 'address'>[],
  options: { dryRun?: boolean } = {},
) {
  tickHearts(roster)
  const updates = traderHeartRateUpdates(roster, hearts)
  if (options.dryRun || Object.keys(updates).length === 0) return { updates, written: false }

  await update(tradersRef, updates)
  return { updates, written: true }
}

export async function setTradersOnline(
  roster: Pick<BotWallet, 'index' | 'address'>[],
  options: { dryRun?: boolean } = {},
) {
  ensureHearts(roster)
  const result = await publishTraders(roster, 'online', options)
  if (!options.dryRun) {
    const session = botSessionId()
    await Promise.all(
      roster.flatMap((wallet) => {
        const key = traderKey(wallet.address)
        return [
          onDisconnect(ref(database, `${TRADERS_PATH}/${key}/sessions/${session}`)).remove(),
          onDisconnect(ref(database, `${TRADERS_PATH}/${key}/heartRate`)).remove(),
          onDisconnect(ref(database, `${TRADERS_PATH}/${key}/heartRateAt`)).remove(),
        ]
      }),
    )
    heartbeatRoster = roster
    heartbeat ??= setInterval(() => {
      void publishTraders(heartbeatRoster, 'online', options).catch((error) => {
        console.error('Failed to refresh bot trader presence:', error)
      })
    }, PRESENCE_HEARTBEAT_MS)
    void publishHeartRates(roster, options).catch((error) => {
      console.error('Failed to publish bot heart rates:', error)
    })
    heartRate ??= setInterval(() => {
      void publishHeartRates(heartbeatRoster, options).catch((error) => {
        console.error('Failed to refresh bot heart rates:', error)
      })
    }, HEART_RATE_MS)
  }
  return result
}

export async function setTradersOffline(
  roster: Pick<BotWallet, 'index' | 'address'>[],
  options: { dryRun?: boolean } = {},
) {
  if (heartbeat) {
    clearInterval(heartbeat)
    heartbeat = undefined
  }
  if (heartRate) {
    clearInterval(heartRate)
    heartRate = undefined
  }
  heartbeatRoster = []
  const clears = traderHeartRateClears(roster)
  hearts.clear()
  if (!options.dryRun && Object.keys(clears).length > 0) {
    await update(tradersRef, clears)
  }
  return publishTraders(roster, 'offline', options)
}
