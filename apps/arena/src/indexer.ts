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
export const HEARTBEAT_MS = 5_000

export class Indexer {
  private logsSubscription: number | null = null
  private accountSubscription: number | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private catchUpTimer: ReturnType<typeof setTimeout> | null = null
  private pulsing = false
  private stateKey: string | null = null
  private historyKey: string | null = null
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
    this.logsSubscription = this.chain.er.onLogs(
      this.chain.programId,
      ({ signature, err, logs }) => {
        if (err) return
        void this.processTransaction(signature, logs, true)
      },
      'confirmed',
    )
    this.accountSubscription = this.chain.er.onAccountChange(
      this.chain.arena,
      info => {
        void this.onArenaAccount(info.data)
      },
      { commitment: 'confirmed' },
    )
    this.heartbeatTimer = setInterval(() => void this.pulse(), HEARTBEAT_MS)
    console.log(`[indexer] watching program ${this.chain.programId.toBase58()} and arena ${this.chain.arena.toBase58()} on the ER`)
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
    if (this.accountSubscription !== null) removals.push(this.chain.er.removeAccountChangeListener(this.accountSubscription))
    await Promise.allSettled(removals)
  }

  /** Indexes every event in one transaction's logs. Live events are also broadcast when new. */
  async processTransaction(signature: string, logs: string[], live: boolean): Promise<number> {
    const events = this.chain.parseEvents(logs)
    for (const event of events) {
      try {
        await this.handleEvent(signature, event, live)
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

  private async handleEvent(sig: string, event: ParsedEvent, live: boolean): Promise<void> {
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
        const cheers = mapCheers(sig, event.data as CheersPaidEvent)
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
          const count = await this.processTransaction(info.signature, tx.meta.logMessages, false)
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

  private async onArenaAccount(data: Buffer): Promise<void> {
    try {
      await this.syncArena(this.chain.decodeArena(data))
    } catch (error) {
      this.warn('arena-account', () => console.warn(`[indexer] arena update failed: ${errorMessage(error)}`))
    }
  }

  /** Mirrors the Arena account into `rounds` and broadcasts when a round opens or resolves. */
  private async syncArena(arena: ArenaAccount): Promise<void> {
    const { current } = arena
    const roundId = toNumber(current.id)
    if (roundId > 0) {
      await syncRoundFromChain(this.cols, roundFromState(current))
      const key = `${roundId}:${current.status}`
      if (key !== this.stateKey) {
        this.stateKey = key
        const round = await getRound(this.cols, roundId)
        if (round) this.broadcastRound(round)
      }
    }
    const historyKey = `${arena.historyHead.toString()}:${arena.historyLen.toString()}`
    if (historyKey !== this.historyKey) {
      for (const summary of arena.history) {
        if (toNumber(summary.id) > 0 && summary.outcome !== 0) await syncRoundFromChain(this.cols, roundFromSummary(summary))
      }
      this.historyKey = historyKey
    }
  }

  private broadcastRound(round: RoundDto): void {
    const key = `${round.outcome ?? 'open'}:${round.startTs}:${round.openedSig}:${round.resolvedSig}`
    if (this.roundKeys.get(round.roundId) === key) return
    this.roundKeys.set(round.roundId, key)
    if (this.roundKeys.size > 32) {
      const oldest = this.roundKeys.keys().next().value
      if (oldest !== undefined) this.roundKeys.delete(oldest)
    }
    this.hub.broadcast('round', { round })
  }

  /** Every 5 s: re-reads the arena (covers a dropped subscription) and records a price point while open. */
  private async pulse(): Promise<void> {
    if (this.pulsing) return
    this.pulsing = true
    try {
      const arena = await this.chain.fetchArena()
      if (!arena) return
      await this.syncArena(arena)
      const { current } = arena
      const now = Date.now()
      if (current.status !== ROUND_OPEN || now >= toNumber(current.endTs) * 1000) return
      const roundId = toNumber(current.id)
      const point = pointFromPools(roundId, current.yesPool, current.noPool, now)
      if (await savePoint(this.cols, `hb:${roundId}:${now}`, point)) this.hub.broadcast('point', { point })
    } catch (error) {
      this.warn('pulse', () => console.warn(`[indexer] heartbeat failed: ${errorMessage(error)}`))
    } finally {
      this.pulsing = false
    }
  }
}
