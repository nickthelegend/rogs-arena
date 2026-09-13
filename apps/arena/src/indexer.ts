import type { ArenaAccount, ArenaChain, ParsedEvent } from './chain'
import { ROUND_OPEN } from './constants'
import type { Collections } from './db'
import {
  mapCheers,
  mapHeart,
  mapRoundOpened,
  mapRoundResolved,
  mapSettlement,
  mapTrade,
  pointFromPools,
  roundFromState,
  roundFromSummary,
  toNumber,
  type CheersPaidEvent,
  type HeartReportedEvent,
  type PositionSettledEvent,
  type RoundOpenedEvent,
  type RoundResolvedEvent,
  type TradeExecutedEvent,
} from './mappers'
import { roundNumberOf, type Market } from './markets'
import type { RealtimeHub } from './realtime'
import {
  applyRoundOpened,
  applyRoundResolved,
  getRound,
  saveCheers,
  saveClose,
  savePoint,
  saveSettlement,
  saveTrade,
  syncRoundFromChain,
} from './store'
import type { RoundDto, ServiceStatus } from './types'
import { errorMessage, mapLimit, throttled } from './util'

const BACKFILL_LIMIT = 1_000
const BACKFILL_CONCURRENCY = 8
const CATCH_UP_DELAY_MS = 20_000
/** Mongo writes per heartbeat run for this many markets at once; the ER read is a single call either way. */
const PULSE_CONCURRENCY = 3
const ROUND_KEYS_MAX = 128
export const HEARTBEAT_MS = 5_000

export class Indexer {
  private logsSubscription: number | null = null
  private readonly accountSubscriptions: number[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private catchUpTimer: ReturnType<typeof setTimeout> | null = null
  private pulsing = false
  private readonly stateKeys = new Map<string, string>()
  private readonly historyKeys = new Map<string, string>()
  private readonly roundKeys = new Map<number, string>()
  private readonly warn = throttled(30_000)

  constructor(
    private readonly chain: ArenaChain,
    private readonly cols: Collections,
    private readonly hub: RealtimeHub,
    private readonly status: ServiceStatus,
  ) {}

  start(): void {
    // Subscribe before backfilling so nothing lands in the gap; writes are idempotent.
    // One log subscription covers every market: events carry namespaced round ids.
    this.logsSubscription = this.chain.er.onLogs(
      this.chain.programId,
      ({ signature, err, logs }) => {
        if (err) return
        void this.processTransaction(signature, logs, true)
      },
      'confirmed',
    )
    // An arena that is not bootstrapped yet simply stays silent until it exists; the heartbeat re-reads it too.
    for (const market of this.chain.markets) {
      this.accountSubscriptions.push(
        this.chain.er.onAccountChange(
          market.arena,
          info => {
            void this.onArenaAccount(market, info.data)
          },
          { commitment: 'confirmed' },
        ),
      )
    }
    this.heartbeatTimer = setInterval(() => void this.pulse(), HEARTBEAT_MS)
    console.log(
      `[indexer] watching program ${this.chain.programId.toBase58()} and ${this.chain.markets.length} market arenas (${this.chain.markets.map(market => market.symbol).join(', ')}) on the ER`,
    )
    void this.pulse()
    void this.backfill().then(newest => {
      // The ER's signature index lags a few seconds, so transactions from just before boot can be missing
      // from the first page and predate the log subscription. One catch-up pass closes that gap.
      this.catchUpTimer = setTimeout(() => void this.backfill(newest ?? undefined), CATCH_UP_DELAY_MS)
    })
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.catchUpTimer) clearTimeout(this.catchUpTimer)
    const removals: Promise<void>[] = []
    if (this.logsSubscription !== null) removals.push(this.chain.er.removeOnLogsListener(this.logsSubscription))
    for (const id of this.accountSubscriptions) removals.push(this.chain.er.removeAccountChangeListener(id))
    await Promise.allSettled(removals)
  }

  /**
   * Indexes every event in one transaction's logs. Live events are also broadcast when new.
   * `accounts` are the transaction's account keys when already known (backfill); live logs carry none.
   */
  async processTransaction(signature: string, logs: string[], live: boolean, accounts?: string[]): Promise<number> {
    const events = this.chain.parseEvents(logs)
    for (const event of events) {
      try {
        await this.handleEvent(signature, event, live, accounts)
      } catch (error) {
        console.error(`[indexer] ${event.name} ${signature}:${event.index} failed: ${errorMessage(error)}`)
      }
    }
    if (live) {
      this.status.indexer.lastSig = signature
      if (events.length) this.status.indexer.lastEventAt = Date.now()
    }
    return events.length
  }

  private async handleEvent(sig: string, event: ParsedEvent, live: boolean, accounts?: string[]): Promise<void> {
    switch (event.name) {
      case 'TradeExecuted': {
        const { trade, point, close } = mapTrade(sig, event.index, event.data as TradeExecutedEvent)
        const inserted = await saveTrade(this.cols, trade)
        await savePoint(this.cols, trade.id, point)
        if (close) await saveClose(this.cols, close)
        if (live && inserted) {
          this.hub.broadcast('trade', { trade })
          this.hub.broadcast('point', { point })
          if (close) this.hub.broadcast('close', { close })
        }
        return
      }
      case 'RoundOpened': {
        const round = await applyRoundOpened(this.cols, mapRoundOpened(sig, event.data as RoundOpenedEvent))
        if (live && round) this.broadcastRound(round)
        return
      }
      case 'RoundResolved': {
        const round = await applyRoundResolved(this.cols, mapRoundResolved(sig, event.data as RoundResolvedEvent))
        if (live && round) this.broadcastRound(round)
        return
      }
      case 'PositionSettled': {
        const settlement = mapSettlement(sig, event.index, event.data as PositionSettledEvent)
        if ((await saveSettlement(this.cols, settlement)) && live) this.hub.broadcast('settlement', { settlement })
        return
      }
      case 'CheersPaid': {
        // CheersPaid has no round id; the paying arena is an account of the VRF callback transaction.
        const market = this.chain.marketOfAccounts(accounts ?? (await this.chain.transactionAccounts(sig)))
        if (!market) console.warn(`[indexer] cheers ${sig}: arena not found in the transaction; saved without a market`)
        const cheers = mapCheers(sig, event.data as CheersPaidEvent, market?.symbol ?? null)
        if ((await saveCheers(this.cols, cheers)) && live) this.hub.broadcast('cheers', { cheers })
        return
      }
      case 'HeartReported': {
        if (!live) return
        const heart = mapHeart(event.data as HeartReportedEvent)
        this.hub.confirmHeart(heart.owner, heart.bpm, heart.t)
        return
      }
    }
  }

  /** Indexes up to 1,000 recent transactions (newer than `until` when given). Returns the newest signature seen. */
  private async backfill(until?: string): Promise<string | null> {
    const started = Date.now()
    try {
      const signatures = await this.chain.er.getSignaturesForAddress(
        this.chain.programId,
        { limit: BACKFILL_LIMIT, until },
        'confirmed',
      )
      const ordered = signatures.filter(info => !info.err).reverse()
      let events = 0
      let newestEventAt = 0
      let failures = 0
      await mapLimit(ordered, BACKFILL_CONCURRENCY, async info => {
        try {
          const tx = await this.chain.er.getTransaction(info.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          })
          if (!tx?.meta || tx.meta.err || !tx.meta.logMessages) return
          const accounts = tx.transaction.message.staticAccountKeys.map(key => key.toBase58())
          const count = await this.processTransaction(info.signature, tx.meta.logMessages, false, accounts)
          events += count
          if (count && tx.blockTime) newestEventAt = Math.max(newestEventAt, tx.blockTime * 1000)
        } catch (error) {
          failures += 1
          this.warn('backfill-tx', () => console.warn(`[indexer] backfill of ${info.signature} failed: ${errorMessage(error)}`))
        }
      })
      const newest = signatures[0]?.signature
      if (!this.status.indexer.lastSig && newest) this.status.indexer.lastSig = newest
      if (newestEventAt > (this.status.indexer.lastEventAt ?? 0)) this.status.indexer.lastEventAt = newestEventAt
      console.log(
        `[indexer] ${until ? 'catch-up' : 'backfill'}: ${ordered.length} transactions, ${events} events, ${failures} failures in ${Date.now() - started}ms`,
      )
      return newest ?? until ?? null
    } catch (error) {
      console.error(`[indexer] backfill failed: ${errorMessage(error)}`)
      return until ?? null
    }
  }

  private async onArenaAccount(market: Market, data: Buffer): Promise<void> {
    try {
      const arena = this.chain.decodeArena(data)
      if (arena.market === market.id) await this.syncArena(market, arena)
    } catch (error) {
      this.warn(`arena-account:${market.symbol}`, () =>
        console.warn(`[indexer] ${market.symbol} arena update failed: ${errorMessage(error)}`),
      )
    }
  }

  /** Mirrors one market's Arena account into `rounds` and broadcasts when a round opens or resolves. */
  private async syncArena(market: Market, arena: ArenaAccount): Promise<void> {
    const { current } = arena
    const roundId = toNumber(current.id)
    // A freshly initialized market arena holds its bare base id (round number 0) until the first roll.
    if (roundNumberOf(roundId) > 0) {
      await syncRoundFromChain(this.cols, roundFromState(current))
      const key = `${roundId}:${current.status}`
      if (key !== this.stateKeys.get(market.symbol)) {
        this.stateKeys.set(market.symbol, key)
        const round = await getRound(this.cols, roundId)
        if (round) this.broadcastRound(round)
      }
    }
    const historyKey = `${arena.historyHead.toString()}:${arena.historyLen.toString()}`
    if (historyKey !== this.historyKeys.get(market.symbol)) {
      for (const summary of arena.history) {
        if (roundNumberOf(toNumber(summary.id)) > 0 && summary.outcome !== 0) {
          await syncRoundFromChain(this.cols, roundFromSummary(summary))
        }
      }
      this.historyKeys.set(market.symbol, historyKey)
    }
  }

  private broadcastRound(round: RoundDto): void {
    const key = `${round.outcome ?? 'open'}:${round.startTs}:${round.openedSig}:${round.resolvedSig}`
    if (this.roundKeys.get(round.roundId) === key) return
    this.roundKeys.set(round.roundId, key)
    if (this.roundKeys.size > ROUND_KEYS_MAX) {
      const oldest = this.roundKeys.keys().next().value
      if (oldest !== undefined) this.roundKeys.delete(oldest)
    }
    this.hub.broadcast('round', { round })
  }

  /**
   * Every 5 s: re-reads all market arenas in one ER call (covers dropped subscriptions and arenas bootstrapped
   * since the last read) and records a price point for each market whose round is open.
   */
  private async pulse(): Promise<void> {
    if (this.pulsing) return
    this.pulsing = true
    try {
      const arenas = await this.chain.fetchArenas()
      const now = Date.now()
      await mapLimit(arenas, PULSE_CONCURRENCY, async ({ market, account }) => {
        if (!account) return
        try {
          await this.syncArena(market, account)
          const { current } = account
          if (current.status !== ROUND_OPEN || now >= toNumber(current.endTs) * 1000) return
          const roundId = toNumber(current.id)
          const point = pointFromPools(roundId, current.yesPool, current.noPool, now)
          if (await savePoint(this.cols, `hb:${roundId}:${now}`, point)) this.hub.broadcast('point', { point })
        } catch (error) {
          this.warn(`pulse:${market.symbol}`, () =>
            console.warn(`[indexer] ${market.symbol} heartbeat failed: ${errorMessage(error)}`),
          )
        }
      })
    } catch (error) {
      this.warn('pulse', () => console.warn(`[indexer] heartbeat failed: ${errorMessage(error)}`))
    } finally {
      this.pulsing = false
    }
  }
}
