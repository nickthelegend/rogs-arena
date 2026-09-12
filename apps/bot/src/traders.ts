import { PRESENCE_HEARTBEAT_MS, TRADERS_PATH, traderKey } from '@repo/shared/firebase-path'
import type { BotWallet } from '@/wallets'

export { PRESENCE_HEARTBEAT_MS, TRADERS_PATH, traderKey }
export const HEART_RATE_MS = 2_000

export type TraderStatus = 'online' | 'offline'

export type Trader = {
  address: string
  name: string
  status: TraderStatus
  lastSeen?: number
  heartRate?: number
  heartRateAt?: number
}

const NAMES = [
  'nova',
  'kira',
  'jax',
  'mira',
  'leo',
  'sage',
  'rex',
  'nina',
  'otto',
  'ivy',
  'zed',
  'aria',
  'kai',
  'lux',
  'rio',
] as const

export function displayName(wallet: Pick<BotWallet, 'index' | 'address'>) {
  return NAMES[wallet.index % NAMES.length] ?? wallet.address.slice(0, 6)
}

export type BotHeart = {
  bpm: number
  rest: number
}

export function createBotHeart(index: number): BotHeart {
  const rest = 58 + ((index * 5) % 27)
  return { bpm: rest, rest }
}

export function nextBotHeartRate(heart: BotHeart, random = Math.random): BotHeart {
  const roll = random()
  const mix = random()
  const delta =
    roll < 0.06 ? 5 + Math.floor(mix * 7) : roll < 0.18 ? (heart.bpm > heart.rest ? -1 : 1) : Math.floor(mix * 3) - 1
  const bpm = Math.min(heart.rest + 24, Math.max(heart.rest - 10, heart.bpm + delta))
  return { bpm, rest: heart.rest }
}

export function toTrader(
  wallet: Pick<BotWallet, 'index' | 'address'>,
  status: TraderStatus,
  now = Date.now(),
  heart?: BotHeart,
): Trader {
  return {
    address: wallet.address,
    name: displayName(wallet),
    status,
    lastSeen: now,
    ...(status === 'online' && heart ? { heartRate: heart.bpm, heartRateAt: now } : {}),
  }
}

export function traderPresenceUpdates(
  roster: Pick<BotWallet, 'index' | 'address'>[],
  status: TraderStatus,
  now = Date.now(),
  options: { sessionId?: string; hearts?: ReadonlyMap<string, BotHeart> } = {},
) {
  const sessionId = options.sessionId ?? botSessionId()
  return Object.fromEntries(
    roster.flatMap((wallet) => {
      const key = traderKey(wallet.address)
      const heart = options.hearts?.get(key)
      const trader = toTrader(wallet, status, now, heart)
      const fields: [string, unknown][] = [
        [`${key}/address`, trader.address],
        [`${key}/name`, trader.name],
        [`${key}/status`, trader.status],
        [`${key}/lastSeen`, trader.lastSeen ?? now],
      ]

      if (status === 'online') {
        fields.push([`${key}/sessions/${sessionId}`, now])
        if (trader.heartRate != null && trader.heartRateAt != null) {
          fields.push([`${key}/heartRate`, trader.heartRate], [`${key}/heartRateAt`, trader.heartRateAt])
        }
      } else {
        fields.push([`${key}/heartRate`, null], [`${key}/heartRateAt`, null])
      }

      return fields
    }),
  )
}

export function traderHeartRateUpdates(
  roster: Pick<BotWallet, 'address'>[],
  hearts: ReadonlyMap<string, BotHeart>,
  now = Date.now(),
) {
  return Object.fromEntries(
    roster.flatMap((wallet) => {
      const key = traderKey(wallet.address)
      const heart = hearts.get(key)
      if (!heart) return []
      return [
        [`${key}/heartRate`, heart.bpm],
        [`${key}/heartRateAt`, now],
      ]
    }),
  )
}

export function traderHeartRateClears(roster: Pick<BotWallet, 'address'>[]) {
  return Object.fromEntries(
    roster.flatMap((wallet) => {
      const key = traderKey(wallet.address)
      return [
        [`${key}/heartRate`, null],
        [`${key}/heartRateAt`, null],
      ]
    }),
  )
}

export function traderUpdates(
  roster: Pick<BotWallet, 'index' | 'address'>[],
  status: TraderStatus,
  now = Date.now(),
) {
  return Object.fromEntries(roster.map((wallet) => [traderKey(wallet.address), toTrader(wallet, status, now)]))
}

export function botSessionId() {
  return `bot-${process.pid}`
}
