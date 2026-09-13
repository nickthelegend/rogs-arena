import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { signatureOf, VRF_EPHEMERAL_QUEUE, type ArenaAccount, type ArenaChain, type MarketArena, type ParsedEvent } from './chain'
import {
  CHEERS_TIMEOUT_SECONDS,
  MAX_CHEERS_CANDIDATES,
  ROUND_IDLE,
  ROUND_OPEN,
  ROUND_RESOLVED,
  roundStatusLabel,
} from './constants'
import { KEEPER_LOG_MAX, type Collections, type KeeperLogDoc, type MetaDoc } from './db'
import { toNumber, type IntLike, type PositionSettledEvent } from './mappers'
import { marketOfRound, roundNumberOf, type Market } from './markets'
import type { ServiceStatus } from './types'
import { errorMessage, mapLimit, sleep, throttled } from './util'

export const KEEPER_TICK_MS = 2_000
export const ROLL_GRACE_SECONDS = 8
export const CRANK_STALL_SECONDS = 20
export const COMMIT_EVERY_ROUNDS = 12
export const MAX_COMMITS = 9
/** Consecutive rounds the keeper had to roll itself before it schedules a fresh MagicBlock crank task. */
export const CRANK_RESCHEDULE_AFTER_STALLS = 2
export const CRANK_INTERVAL_MS = 2_000
export const CRANK_ITERATIONS = 200_000
const CRANK_RESCHEDULE_BACKOFF_MS = 10 * 60_000
const RETRY_BACKOFF_MS = 6_000
const COMMIT_BACKOFF_MS = 60_000
const MAX_SETTLE_ATTEMPTS = 5
const SETTLE_CONCURRENCY = 4
/** BTC keeps the meta id from before multi-market support so its settle and commit progress carries over. */
const LEGACY_META_ID = 'keeper'

export type RollInput = {
  status: number
  endTs: number
  lastRollTs: number
  treasury: bigint
  liquidity: bigint
  now: number
}

type HistorySummary = { id: IntLike; outcome: number }

/** Why the keeper should send roll_round now, or null when the crank is expected to handle it. */
export function rollReason({ status, endTs, treasury, liquidity, now }: RollInput): string | null {
  if (status === ROUND_OPEN && now >= endTs + ROLL_GRACE_SECONDS) return `crank late: round ended ${now - endTs}s ago`
  if (status === ROUND_IDLE && treasury >= liquidity) return 'arena idle with enough treasury to open a round'
  if (status === ROUND_RESOLVED && treasury >= liquidity) return 'arena paused but treasury now covers liquidity'
  return null
}

/** The crank should have rolled within seconds of end_ts; this flags it well past that. */
export const crankStalled = ({ status, endTs, lastRollTs, now }: RollInput): boolean =>
  status === ROUND_OPEN && now >= endTs + CRANK_STALL_SECONDS && lastRollTs < endTs

/** Round numbers (1, 2, ...), not namespaced ids, so every market commits on the same cadence. */
export const shouldCommit = (latestResolved: number, lastCommitRound: number, commits: number): boolean =>
  commits < MAX_COMMITS && latestResolved - lastCommitRound >= COMMIT_EVERY_ROUNDS

/** The crank task is finite (iterations × interval); a run of stalled rounds means it expired or died. */
export const shouldRescheduleCrank = (stalledRounds: number): boolean => stalledRounds >= CRANK_RESCHEDULE_AFTER_STALLS

/** Keeper meta document id for a market. */
export const keeperMetaId = (market: string): string => (market === 'BTC' ? LEGACY_META_ID : `keeper:${market}`)

/** Namespaced ids of resolved rounds in an arena's history newer than `settledThrough`, oldest first. */
export const resolvedRoundsAfter = (history: readonly HistorySummary[], settledThrough: number): number[] =>
  history
    .filter(summary => summary.outcome !== 0 && toNumber(summary.id) > settledThrough)
    .map(summary => toNumber(summary.id))
    .sort((a, b) => a - b)

/** The newest resolved round number in an arena's history, 0 if none. */
export const latestResolvedRoundNumber = (history: readonly HistorySummary[]): number =>
  history.reduce((max, summary) => (summary.outcome !== 0 ? Math.max(max, roundNumberOf(toNumber(summary.id))) : max), 0)

/**
 * Bootstrap scheduled `rogs-arena:rounds:<arena>`; a reschedule appends the round it was triggered in so the
 * new task gets a fresh id instead of colliding with the dead one.
 */
/**
 * Fair Cheers: every distinct recent trader except the winner, which is exactly the set the program
 * requires (Arena::cheers_candidate_count). The keeper must not curate or truncate it.
 */
export function cheersCandidateOwners(recent: readonly PublicKey[], winner: PublicKey): PublicKey[] {
  const seen = new Set<string>()
  const owners: PublicKey[] = []
  for (const owner of recent) {
    const id = owner.toBase58()
    if (owner.equals(PublicKey.default) || owner.equals(winner) || seen.has(id)) continue
    seen.add(id)
    owners.push(owner)
  }
  return owners
}

/** Whether a settle_player transaction really settled `owner` in `roundId`; a no-op settle emits no event. */
export function settledIn(events: readonly ParsedEvent[], owner: PublicKey, roundId: number): boolean {
  return events.some(event => {
    if (event.name !== 'PositionSettled') return false
    const data = event.data as PositionSettledEvent
    return toNumber(data.round_id) === roundId && data.owner.toBase58() === owner.toBase58()
  })
}

export const crankTaskLabel = (arena: string, roundId: number): string => `rogs-arena:rounds:${arena}:r${roundId}`

/**
 * The market a pending cheers was earned in. Cheers wins (settlements with `cheers`) are matched oldest first
 * against cheers already paid from the same market; the first unmatched win names the market. When paid cheers
 * cover every indexed win (an indexing gap), the newest win's market is used. Null without any win.
 */
export function cheersMarket(
  wins: readonly { market: string; t: number }[],
  paid: readonly { market: string | null }[],
): string | null {
  const credit = new Map<string, number>()
  for (const cheers of paid) if (cheers.market) credit.set(cheers.market, (credit.get(cheers.market) ?? 0) + 1)
  const ordered = [...wins].sort((a, b) => a.t - b.t)
  for (const win of ordered) {
    const left = credit.get(win.market) ?? 0
    if (left === 0) return win.market
    credit.set(win.market, left - 1)
  }
  return ordered.at(-1)?.market ?? null
}

/** Same derivation as `crankTaskId` in @rogs/arena-sdk: the first 7 bytes of SHA-256(label). */
export async function crankTaskId(label: string): Promise<bigint> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)))
  let value = 0n
  for (let i = 0; i < 7; i++) value = (value << 8n) | BigInt(digest[i]!)
  return value
}

type MarketWatch = {
  lastSeen: { id: number; status: number } | null
  stallLoggedFor: number | null
  stalledRounds: number
  oracleMismatchLogged: boolean
}

const roundLabel = (market: Market, roundId: number) => `${market.symbol} round ${roundNumberOf(roundId)}`

export class Keeper {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private meta: Map<string, MetaDoc> | null = null
  private logWrites = 0
  private readonly watches = new Map<string, MarketWatch>()
  private readonly retryAfter = new Map<string, number>()
  private readonly settleAttempts = new Map<string, number>()
  private readonly quiet = throttled(60_000)

  constructor(
    private readonly chain: ArenaChain,
    private readonly cols: Collections,
    private readonly status: ServiceStatus,
    private readonly keeperLogCapped: boolean,
  ) {}

  start(): void {
    console.log(
      `[keeper] started; signer ${this.chain.keeper.publicKey.toBase58()}, tick ${KEEPER_TICK_MS}ms, markets ${this.chain.markets.map(market => market.symbol).join(', ')}`,
    )
    this.timer = setInterval(() => void this.tick(), KEEPER_TICK_MS)
    void this.tick()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    const deadline = Date.now() + 10_000
    while (this.running && Date.now() < deadline) await sleep(100)
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      // One ER read for all arenas; markets that are not bootstrapped yet come back null and are skipped
      // (ArenaChain logs their availability).
      const arenas = await this.chain.fetchArenas()
      await this.loadMeta()
      const now = Math.floor(Date.now() / 1000)
      let committed = false
      // Markets are tended one after another: rounds of all markets end together, and running them in parallel
      // would turn every round boundary into nine concurrent waves of roll and settle transactions on the ER.
      for (const { market, account } of arenas) {
        if (!account) continue
        try {
          this.observeRound(market, account)
          await this.watchdog(market, account, now)
          await this.settleResolvedRounds(market, account)
          // Commits are not urgent: at most one per tick spreads the markets' commits across ticks.
          if (!committed) committed = await this.maybeCommit(market, account)
        } catch (error) {
          this.quiet(`tick:${market.symbol}:${errorMessage(error)}`, () =>
            void this.log('error', 'tick', `Keeper tick failed for ${market.symbol}`, null, error),
          )
        }
      }
      await this.processCheers(arenas, now)
    } catch (error) {
      this.quiet(`tick:${errorMessage(error)}`, () => void this.log('error', 'tick', 'Keeper tick failed', null, error))
    } finally {
      this.running = false
    }
  }

  private watch(market: Market): MarketWatch {
    let watch = this.watches.get(market.symbol)
    if (!watch) {
      watch = { lastSeen: null, stallLoggedFor: null, stalledRounds: 0, oracleMismatchLogged: false }
      this.watches.set(market.symbol, watch)
    }
    return watch
  }

  /** Loads every market's keeper meta once; afterwards this process is the only writer and keeps it in memory. */
  private async loadMeta(): Promise<void> {
    if (this.meta) return
    const ids = this.chain.markets.map(market => keeperMetaId(market.symbol))
    const docs = await this.cols.meta.find({ _id: { $in: ids } }).toArray()
    this.meta = new Map(
      this.chain.markets.map(market => {
        const id = keeperMetaId(market.symbol)
        return [market.symbol, docs.find(doc => doc._id === id) ?? { _id: id }]
      }),
    )
  }

  private metaOf(market: Market): MetaDoc {
    const meta = this.meta?.get(market.symbol)
    if (!meta) throw new Error(`Keeper meta for ${market.symbol} is not loaded`)
    return meta
  }

  /** Logs round transitions the keeper did not cause: those came from the MagicBlock crank. */
  private observeRound(market: Market, arena: ArenaAccount): void {
    const watch = this.watch(market)
    const id = toNumber(arena.current.id)
    const status = arena.current.status
    const previous = watch.lastSeen
    watch.lastSeen = { id, status }
    if (!previous || (previous.id === id && previous.status === status)) return
    watch.stalledRounds = 0
    void this.log(
      'info',
      'crank',
      `Crank rolled: ${roundLabel(market, previous.id)} (${roundStatusLabel(previous.status)}) -> round ${roundNumberOf(id)} (${roundStatusLabel(status)}), last_roll_ts ${toNumber(arena.lastRollTs)}`,
    )
  }

  private async watchdog(market: Market, arena: ArenaAccount, now: number): Promise<void> {
    const watch = this.watch(market)
    const id = toNumber(arena.current.id)
    const input: RollInput = {
      status: arena.current.status,
      endTs: toNumber(arena.current.endTs),
      lastRollTs: toNumber(arena.lastRollTs),
      treasury: BigInt(arena.treasury.toString()),
      liquidity: BigInt(arena.liquidity.toString()),
      now,
    }
    if (!arena.oracleFeed.equals(market.oracleFeed) && !watch.oracleMismatchLogged) {
      watch.oracleMismatchLogged = true
      await this.log(
        'warn',
        'oracle',
        `${market.symbol} arena oracle ${arena.oracleFeed.toBase58()} differs from the configured ${market.oracleFeed.toBase58()}; using the arena's`,
      )
    }
    if (crankStalled(input) && watch.stallLoggedFor !== id) {
      watch.stallLoggedFor = id
      watch.stalledRounds += 1
      await this.log(
        'warn',
        'crank',
        `Crank looks stalled: ${roundLabel(market, id)} ended ${now - input.endTs}s ago, last_roll_ts is ${input.endTs - input.lastRollTs}s behind end_ts (task ${arena.crankTaskId.toString()}, ${watch.stalledRounds} stalled round(s) in a row)`,
      )
      const scheduleKey = `crank-schedule:${market.symbol}`
      if (shouldRescheduleCrank(watch.stalledRounds) && !this.inBackoff(scheduleKey)) {
        await this.rescheduleCrank(market, arena, id, scheduleKey)
      }
    }

    const reason = rollReason(input)
    const rollKey = `roll:${market.symbol}`
    if (!reason || this.inBackoff(rollKey)) return
    try {
      const tx = await this.chain.program.methods
        .rollRound()
        .accountsPartial({ arena: market.arena, priceFeed: arena.oracleFeed })
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      this.status.keeper.lastRollSig = sig
      this.status.keeper.lastRollAt = Date.now()
      const after = await this.chain.fetchArena(market)
      const afterId = after ? toNumber(after.current.id) : id
      const afterStatus = after ? after.current.status : input.status
      if (after) watch.lastSeen = { id: afterId, status: afterStatus }
      if (afterId !== id || afterStatus !== input.status) {
        await this.log(
          'warn',
          'roll',
          `Keeper stepped in (${reason}): ${roundLabel(market, id)} (${roundStatusLabel(input.status)}) -> round ${roundNumberOf(afterId)} (${roundStatusLabel(afterStatus)})`,
          sig,
        )
      } else {
        this.backoff(rollKey, RETRY_BACKOFF_MS)
        await this.log(
          'info',
          'roll',
          `Keeper roll of ${market.symbol} was a no-op (${reason}); the crank had already rolled or the ER clock lags`,
          sig,
        )
      }
    } catch (error) {
      this.backoff(rollKey, RETRY_BACKOFF_MS)
      await this.log('error', 'roll', `Keeper roll of ${market.symbol} failed (${reason})`, signatureOf(error), error)
    }
  }

  private async settleResolvedRounds(market: Market, arena: ArenaAccount): Promise<void> {
    const meta = this.metaOf(market)
    for (const roundId of resolvedRoundsAfter(arena.history, meta.settledThrough ?? 0)) {
      if (!(await this.settleRound(market, roundId))) return
      await this.cols.meta.updateOne({ _id: meta._id }, { $set: { settledThrough: roundId } }, { upsert: true })
      meta.settledThrough = roundId
    }
  }

  /** Settles every trader of a resolved round that still holds its position. True when nothing is left to retry. */
  private async settleRound(market: Market, roundId: number): Promise<boolean> {
    // Round ids are unique across markets, so no market filter: that also covers trades written without one.
    const owners = (await this.cols.trades.distinct('owner', { roundId })) as string[]
    if (owners.length === 0) return true
    const keys = owners.map(owner => new PublicKey(owner))
    const players = await this.chain.fetchPlayers(keys)
    let complete = true
    await mapLimit(keys, SETTLE_CONCURRENCY, async (owner, index) => {
      const player = players[index]
      const holds = player?.positions.some(position => position.active && toNumber(position.roundId) === roundId)
      if (!holds) return
      const key = `settle:${roundId}:${owner.toBase58()}`
      const attempts = this.settleAttempts.get(key) ?? 0
      if (attempts >= MAX_SETTLE_ATTEMPTS) return
      if (this.inBackoff(key)) {
        complete = false
        return
      }
      try {
        // settle_player settles the slots whose rounds this arena resolved, so it gets the round's market arena.
        const tx = await this.chain.program.methods
          .settlePlayer()
          .accountsPartial({ arena: market.arena, player: this.chain.playerPda(owner) })
          .transaction()
        const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
        this.settleAttempts.delete(key)
        // The batched player read can be stale: the owner's client or another tx may have settled first.
        const events = await this.chain.erTransactionEvents(sig)
        const label = `${owner.toBase58()} for ${roundLabel(market, roundId)}`
        if (events === null) await this.log('warn', 'settle', `Sent settle for ${label}, but its logs could not be read to confirm it`, sig)
        else if (settledIn(events, owner, roundId)) await this.log('info', 'settle', `Settled ${label}`, sig)
        else await this.log('info', 'settle', `No-op settle for ${label}: another transaction had already settled it`, sig)
      } catch (error) {
        this.settleAttempts.set(key, attempts + 1)
        const givingUp = attempts + 1 >= MAX_SETTLE_ATTEMPTS
        if (!givingUp) {
          complete = false
          this.backoff(key, RETRY_BACKOFF_MS)
        }
        await this.log(
          'error',
          'settle',
          `settlePlayer failed for ${owner.toBase58()} ${roundLabel(market, roundId)} (attempt ${attempts + 1}${givingUp ? ', giving up' : ''})`,
          signatureOf(error),
          error,
        )
      }
    })
    return complete
  }

  private async processCheers(arenas: readonly MarketArena[], now: number): Promise<void> {
    const owners = (await this.cols.settlements.distinct('owner', { cheers: true })) as string[]
    if (owners.length === 0) return
    const keys = owners.map(owner => new PublicKey(owner))
    const players = await this.chain.fetchPlayers(keys)
    for (const [index, player] of players.entries()) {
      const owner = keys[index]
      if (!player || !owner) continue
      if (player.cheersInflight === 1) {
        const age = now - toNumber(player.cheersRequestedTs)
        if (age >= CHEERS_TIMEOUT_SECONDS) await this.resetCheers(owner, age)
      } else if (player.cheersPending > 0) {
        await this.requestCheers(arenas, owner)
      }
    }
  }

  private async requestCheers(arenas: readonly MarketArena[], owner: PublicKey): Promise<void> {
    const wallet = owner.toBase58()
    const key = `cheers:${wallet}`
    if (this.inBackoff(key)) return
    const [wins, paid] = await Promise.all([
      this.cols.settlements.find({ owner: wallet, cheers: true }, { projection: { _id: 0, roundId: 1, t: 1 } }).toArray(),
      this.cols.cheers.find({ owner: wallet }, { projection: { _id: 0, market: 1 } }).toArray(),
    ])
    // The market comes from each win's round id, which every settlement has, rather than a stored field.
    const symbol = cheersMarket(
      wins.map(win => ({ market: marketOfRound(win.roundId), t: win.t })),
      paid.map(cheers => ({ market: cheers.market ?? null })),
    )
    const arena = arenas.find(candidate => candidate.market.symbol === symbol)
    if (!arena?.account) {
      this.quiet(`${key}:market`, () =>
        void this.log('info', 'cheers', `Cheers pending for ${wallet}, but the arena of the market it was won in (${symbol ?? 'unknown'}) is not readable`),
      )
      return
    }
    const { market, account } = arena
    const { candidates, offEr } = await this.cheersCandidates(account, owner)
    if (candidates.length === 0) {
      this.quiet(`${key}:empty`, () =>
        void this.log('info', 'cheers', `Cheers pending for ${wallet}, but no other recent ${market.symbol} trader exists yet`),
      )
      return
    }
    if (offEr > 0 || candidates.length > MAX_CHEERS_CANDIDATES) {
      this.quiet(`${key}:incomplete`, () =>
        void this.log(
          'info',
          'cheers',
          `Cheers pending for ${wallet}, but ${offEr} of ${candidates.length} recent ${market.symbol} traders are not on the ER; the program requires all of them, so the request waits`,
        ),
      )
      return
    }
    try {
      const seed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      const tx = await this.chain.program.methods
        .requestCheers(seed)
        .accountsPartial({
          payer: this.chain.keeper.publicKey,
          arena: market.arena,
          winner: this.chain.playerPda(owner),
          oracleQueue: VRF_EPHEMERAL_QUEUE,
        })
        .remainingAccounts(candidates.map(pubkey => ({ pubkey, isSigner: false, isWritable: false })))
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      await this.log('info', 'cheers', `Requested VRF cheers for ${wallet} on ${market.symbol} with ${candidates.length} candidates`, sig)
    } catch (error) {
      this.backoff(key, RETRY_BACKOFF_MS * 5)
      await this.log('error', 'cheers', `requestCheers failed for ${wallet} on ${market.symbol}`, signatureOf(error), error)
    }
  }

  /** Player PDAs of every Fair Cheers candidate, and how many of them are not readable on the ER. */
  private async cheersCandidates(arena: ArenaAccount, winner: PublicKey): Promise<{ candidates: PublicKey[]; offEr: number }> {
    const candidates = cheersCandidateOwners(arena.recent, winner).map(owner => this.chain.playerPda(owner))
    if (candidates.length === 0) return { candidates, offEr: 0 }
    const infos = await this.chain.er.getMultipleAccountsInfo(candidates, 'confirmed')
    const offEr = infos.filter(info => !info?.owner.equals(this.chain.programId)).length
    return { candidates, offEr }
  }

  private async resetCheers(owner: PublicKey, age: number): Promise<void> {
    const key = `reset:${owner.toBase58()}`
    if (this.inBackoff(key)) return
    try {
      const tx = await this.chain.program.methods
        .resetCheers()
        .accountsPartial({ player: this.chain.playerPda(owner) })
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      await this.log('warn', 'cheers', `Reset stuck cheers request for ${owner.toBase58()} (inflight ${age}s)`, sig)
    } catch (error) {
      this.backoff(key, RETRY_BACKOFF_MS * 5)
      await this.log('error', 'cheers', `resetCheers failed for ${owner.toBase58()}`, signatureOf(error), error)
    }
  }

  /**
   * Schedules a fresh MagicBlock crank task for one market's roll_round. The previous task either ran out of
   * iterations or died; the keeper has been rolling that market's rounds itself in the meantime.
   */
  private async rescheduleCrank(market: Market, arena: ArenaAccount, roundId: number, backoffKey: string): Promise<void> {
    this.backoff(backoffKey, CRANK_RESCHEDULE_BACKOFF_MS)
    try {
      const taskId = await crankTaskId(crankTaskLabel(market.arena.toBase58(), roundId))
      const tx = await this.chain.program.methods
        .scheduleRoundCrank(new BN(taskId.toString()), new BN(CRANK_INTERVAL_MS), new BN(CRANK_ITERATIONS))
        .accountsPartial({ authority: this.chain.keeper.publicKey, arena: market.arena, priceFeed: arena.oracleFeed })
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      this.watch(market).stalledRounds = 0
      await this.log(
        'warn',
        'crank',
        `Scheduled a fresh ${market.symbol} crank task ${taskId} after ${CRANK_RESCHEDULE_AFTER_STALLS} stalled rounds`,
        sig,
      )
    } catch (error) {
      await this.log('error', 'crank', `scheduleRoundCrank failed for ${market.symbol}`, signatureOf(error), error)
    }
  }

  /** Commits one market's arena to Solana every 12 resolved rounds. Returns true when it sent a commit. */
  private async maybeCommit(market: Market, arena: ArenaAccount): Promise<boolean> {
    const latestResolved = latestResolvedRoundNumber(arena.history)
    const commitKey = `commit:${market.symbol}`
    if (latestResolved === 0 || this.inBackoff(commitKey)) return false
    const meta = this.metaOf(market)
    // The Arena counts its own commits on chain, including ones sent outside this keeper (bootstrap, scripts);
    // the per-delegation cap applies to that total.
    const commits = Math.max(meta.commits ?? 0, toNumber(arena.commits))
    if (!shouldCommit(latestResolved, meta.lastCommitRound ?? 0, commits)) return false
    try {
      const tx = await this.chain.program.methods
        .commitArena()
        .accountsPartial({ payer: this.chain.keeper.publicKey, arena: market.arena })
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      const at = Date.now()
      await this.cols.meta.updateOne(
        { _id: meta._id },
        { $set: { lastCommitRound: latestResolved, lastCommitSig: sig, lastCommitAt: at }, $inc: { commits: 1 } },
        { upsert: true },
      )
      Object.assign(meta, { lastCommitRound: latestResolved, lastCommitSig: sig, lastCommitAt: at, commits: (meta.commits ?? 0) + 1 })
      await this.log(
        'info',
        'commit',
        `Committed the ${market.symbol} arena to Solana after round ${latestResolved} (${commits + 1}/${MAX_COMMITS})`,
        sig,
      )
    } catch (error) {
      this.backoff(commitKey, COMMIT_BACKOFF_MS)
      await this.log('error', 'commit', `commitArena failed for ${market.symbol}`, signatureOf(error), error)
    }
    return true
  }

  private inBackoff(key: string): boolean {
    return (this.retryAfter.get(key) ?? 0) > Date.now()
  }

  private backoff(key: string, ms: number): void {
    this.retryAfter.set(key, Date.now() + ms)
  }

  private async log(level: KeeperLogDoc['level'], action: string, message: string, sig: string | null = null, error?: unknown) {
    const errorText = error === undefined ? null : errorMessage(error)
    const line = `[keeper] ${action}: ${message}${sig ? ` sig=${sig}` : ''}${errorText ? ` error=${errorText}` : ''}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
    try {
      await this.cols.keeper_log.insertOne({ t: Date.now(), level, action, message, sig, error: errorText })
      this.logWrites += 1
      if (!this.keeperLogCapped && this.logWrites % 25 === 0) await this.trimLog()
    } catch (writeError) {
      console.error(`[keeper] could not write keeper_log: ${errorMessage(writeError)}`)
    }
  }

  private async trimLog(): Promise<void> {
    const overflow = (await this.cols.keeper_log.estimatedDocumentCount()) - KEEPER_LOG_MAX
    if (overflow <= 0) return
    const oldest = await this.cols.keeper_log.find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(overflow).toArray()
    await this.cols.keeper_log.deleteMany({ _id: { $in: oldest.map(doc => doc._id) } })
  }
}
