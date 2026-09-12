import type { TraderDto } from './types'

export const PRESENCE_TTL_MS = 45_000
export const PRESENCE_SWEEP_MS = 5_000
export const HEART_TTL_MS = 45_000
/** Offline traders stay listed this long so the UI can show "last seen". */
export const OFFLINE_RETENTION_MS = 15 * 60_000

type Session = { connId: string; wallet: string | null; lastSeen: number }
type Trader = { lastSeen: number; heartRate: number | null; heartRateAt: number | null }

export type PresenceList = { traders: TraderDto[]; anonymous: number; online: number }

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`

/** In-memory presence. All time comes from the injected clock so tests can drive TTLs. */
export class Presence {
  private readonly sessions = new Map<string, Session>()
  private readonly traders = new Map<string, Trader>()
  private readonly names = new Map<string, string>()
  private readonly bots = new Set<string>()
  private reported = '0#'

  constructor(private readonly clock: () => number = Date.now) {}

  /** Registers or refreshes a tab session. Returns true when the visible trader list changed. */
  join(sessionId: string, connId: string, wallet: string | null): boolean {
    return this.mutate(() => {
      const now = this.clock()
      const previous = this.sessions.get(sessionId)
      if (previous?.wallet && previous.wallet !== wallet) this.touchTrader(previous.wallet, now)
      this.sessions.set(sessionId, { connId, wallet, lastSeen: now })
      if (wallet) this.touchTrader(wallet, now)
    })
  }

  /** Drops a session, unless another connection has since taken over the same tab id. */
  leave(sessionId: string, connId: string): boolean {
    return this.mutate(() => {
      const session = this.sessions.get(sessionId)
      if (!session || session.connId !== connId) return
      this.sessions.delete(sessionId)
      if (session.wallet) this.touchTrader(session.wallet, this.clock())
    })
  }

  setHeart(wallet: string, bpm: number | null): boolean {
    return this.mutate(() => {
      const now = this.clock()
      const trader = this.touchTrader(wallet, now)
      trader.heartRate = bpm
      trader.heartRateAt = bpm === null ? null : now
    })
  }

  /** Applies an on-chain HeartReported value unless a newer live value already exists. */
  confirmHeart(wallet: string, bpm: number, at: number): boolean {
    const trader = this.traders.get(wallet)
    if (!trader || (trader.heartRateAt !== null && trader.heartRateAt > at)) return false
    return this.mutate(() => {
      trader.heartRate = bpm
      trader.heartRateAt = at
    })
  }

  setProfile(wallet: string, displayName: string | null, isBot: boolean): boolean {
    return this.mutate(() => {
      if (displayName) this.names.set(wallet, displayName)
      else this.names.delete(wallet)
      if (isBot) this.bots.add(wallet)
      else this.bots.delete(wallet)
    })
  }

  nameOf(wallet: string): string {
    return this.names.get(wallet) ?? shortAddress(wallet)
  }

  sweep(): boolean {
    return this.mutate(() => {
      const now = this.clock()
      for (const [sessionId, session] of this.sessions) {
        if (now - session.lastSeen > PRESENCE_TTL_MS) this.sessions.delete(sessionId)
      }
      const online = this.onlineWallets(now)
      for (const [wallet, trader] of this.traders) {
        if (trader.heartRateAt !== null && now - trader.heartRateAt > HEART_TTL_MS) {
          trader.heartRate = null
          trader.heartRateAt = null
        }
        if (!online.has(wallet) && now - trader.lastSeen > OFFLINE_RETENTION_MS) this.traders.delete(wallet)
      }
    })
  }

  list(): PresenceList {
    const now = this.clock()
    const online = this.onlineWallets(now)
    const traders: TraderDto[] = []
    for (const [address, trader] of this.traders) {
      const heartLive = trader.heartRateAt !== null && now - trader.heartRateAt <= HEART_TTL_MS
      traders.push({
        address,
        name: this.nameOf(address),
        status: online.has(address) ? 'online' : 'offline',
        lastSeen: trader.lastSeen,
        heartRate: heartLive ? trader.heartRate : null,
        heartRateAt: heartLive ? trader.heartRateAt : null,
        isBot: this.bots.has(address),
      })
    }
    traders.sort((a, b) => (a.status === b.status ? b.lastSeen - a.lastSeen : a.status === 'online' ? -1 : 1))
    let anonymous = 0
    for (const session of this.sessions.values()) {
      if (!session.wallet && now - session.lastSeen <= PRESENCE_TTL_MS) anonymous += 1
    }
    return { traders, anonymous, online: online.size + anonymous }
  }

  private onlineWallets(now: number): Set<string> {
    const online = new Set<string>()
    for (const session of this.sessions.values()) {
      if (session.wallet && now - session.lastSeen <= PRESENCE_TTL_MS) online.add(session.wallet)
    }
    return online
  }

  private touchTrader(wallet: string, now: number): Trader {
    let trader = this.traders.get(wallet)
    if (!trader) {
      trader = { lastSeen: now, heartRate: null, heartRateAt: null }
      this.traders.set(wallet, trader)
    }
    trader.lastSeen = Math.max(trader.lastSeen, now)
    return trader
  }

  // lastSeen is excluded so routine presence pings do not trigger broadcasts.
  private signature(): string {
    const { traders, anonymous } = this.list()
    const rows = traders.map(t => `${t.address}|${t.name}|${t.status}|${t.heartRate}|${t.isBot}`).sort()
    return `${anonymous}#${rows.join(',')}`
  }

  // Compares against the last reported state, not the state just before `change`: expiry is
  // clock-driven, so the visible list can change between calls without any mutation.
  private mutate(change: () => void): boolean {
    change()
    const next = this.signature()
    const changed = next !== this.reported
    this.reported = next
    return changed
  }
}
