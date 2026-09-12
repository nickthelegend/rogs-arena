import { PublicKey } from '@solana/web3.js'
import { signatureOf, VRF_EPHEMERAL_QUEUE, type ArenaAccount, type ArenaChain } from './chain'
import {
  CHEERS_TIMEOUT_SECONDS,
  MAX_CHEERS_CANDIDATES,
  ROUND_IDLE,
  ROUND_OPEN,
  ROUND_RESOLVED,
  roundStatusLabel,
} from './constants'
import { KEEPER_LOG_MAX, type Collections, type KeeperLogDoc } from './db'
import { toNumber } from './mappers'
import type { ServiceStatus } from './types'
import { errorMessage, mapLimit, sleep, throttled } from './util'

export const KEEPER_TICK_MS = 2_000
export const ROLL_GRACE_SECONDS = 8
export const CRANK_STALL_SECONDS = 20
export const COMMIT_EVERY_ROUNDS = 12
export const MAX_COMMITS = 9
const RETRY_BACKOFF_MS = 6_000
const COMMIT_BACKOFF_MS = 60_000
const MAX_SETTLE_ATTEMPTS = 5
const SETTLE_CONCURRENCY = 4
const META_ID = 'keeper'

export type RollInput = {
  status: number
  endTs: number
  lastRollTs: number
  treasury: bigint
  liquidity: bigint
  now: number
}

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

export const shouldCommit = (latestResolved: number, lastCommitRound: number, commits: number): boolean =>
  commits < MAX_COMMITS && latestResolved - lastCommitRound >= COMMIT_EVERY_ROUNDS

export class Keeper {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastSeen: { id: number; status: number } | null = null
  private settledThrough: number | null = null
  private stallLoggedFor: number | null = null
  private oracleMismatchLogged = false
  private logWrites = 0
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
    console.log(`[keeper] started; signer ${this.chain.keeper.publicKey.toBase58()}, tick ${KEEPER_TICK_MS}ms`)
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
      const arena = await this.chain.fetchArena()
      if (!arena) {
        this.quiet('no-arena', () => void this.log('warn', 'arena', 'Arena account not found on the ER; waiting for bootstrap'))
        return
      }
      const now = Math.floor(Date.now() / 1000)
      this.observeRound(arena)
      await this.watchdog(arena, now)
      await this.settleResolvedRounds(arena)
      await this.processCheers(arena, now)
      await this.maybeCommit(arena)
    } catch (error) {
      this.quiet(`tick:${errorMessage(error)}`, () => void this.log('error', 'tick', 'Keeper tick failed', null, error))
    } finally {
      this.running = false
    }
  }

  /** Logs round transitions the keeper did not cause: those came from the MagicBlock crank. */
  private observeRound(arena: ArenaAccount): void {
    const id = toNumber(arena.current.id)
    const status = arena.current.status
    const previous = this.lastSeen
    this.lastSeen = { id, status }
    if (!previous || (previous.id === id && previous.status === status)) return
    void this.log(
      'info',
      'crank',
      `Crank rolled: round ${previous.id} (${roundStatusLabel(previous.status)}) -> round ${id} (${roundStatusLabel(status)}), last_roll_ts ${toNumber(arena.lastRollTs)}`,
    )
  }

  private async watchdog(arena: ArenaAccount, now: number): Promise<void> {
    const id = toNumber(arena.current.id)
    const input: RollInput = {
      status: arena.current.status,
      endTs: toNumber(arena.current.endTs),
      lastRollTs: toNumber(arena.lastRollTs),
      treasury: BigInt(arena.treasury.toString()),
      liquidity: BigInt(arena.liquidity.toString()),
      now,
    }
    if (!arena.oracleFeed.equals(this.chain.oracleFeed) && !this.oracleMismatchLogged) {
      this.oracleMismatchLogged = true
      await this.log('warn', 'oracle', `Arena oracle ${arena.oracleFeed.toBase58()} differs from ORACLE_BTC_FEED; using the arena's`)
    }
    if (crankStalled(input) && this.stallLoggedFor !== id) {
      this.stallLoggedFor = id
      await this.log(
        'warn',
        'crank',
        `Crank looks stalled: round ${id} ended ${now - input.endTs}s ago, last_roll_ts is ${input.endTs - input.lastRollTs}s behind end_ts (task ${arena.crankTaskId.toString()}). Re-schedule it with the crank script.`,
      )
    }

    const reason = rollReason(input)
    if (!reason || this.inBackoff('roll')) return
    try {
      const tx = await this.chain.program.methods
        .rollRound()
        .accountsPartial({ arena: this.chain.arena, priceFeed: arena.oracleFeed })
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      this.status.keeper.lastRollSig = sig
      this.status.keeper.lastRollAt = Date.now()
      const after = await this.chain.fetchArena()
      const afterId = after ? toNumber(after.current.id) : id
      const afterStatus = after ? after.current.status : input.status
      if (after) this.lastSeen = { id: afterId, status: afterStatus }
      if (afterId !== id || afterStatus !== input.status) {
        await this.log(
          'warn',
          'roll',
          `Keeper stepped in (${reason}): round ${id} (${roundStatusLabel(input.status)}) -> round ${afterId} (${roundStatusLabel(afterStatus)})`,
          sig,
        )
      } else {
        this.backoff('roll', RETRY_BACKOFF_MS)
        await this.log('info', 'roll', `Keeper roll was a no-op (${reason}); the crank had already rolled or the ER clock lags`, sig)
      }
    } catch (error) {
      this.backoff('roll', RETRY_BACKOFF_MS)
      await this.log('error', 'roll', `Keeper roll failed (${reason})`, signatureOf(error), error)
    }
  }

  private async settleResolvedRounds(arena: ArenaAccount): Promise<void> {
    if (this.settledThrough === null) {
      const meta = await this.cols.meta.findOne({ _id: META_ID })
      this.settledThrough = meta?.settledThrough ?? 0
    }
    const resolved = arena.history
      .filter(summary => summary.outcome !== 0 && toNumber(summary.id) > (this.settledThrough ?? 0))
      .map(summary => toNumber(summary.id))
      .sort((a, b) => a - b)
    for (const roundId of resolved) {
      if (!(await this.settleRound(roundId))) return
      this.settledThrough = roundId
      await this.cols.meta.updateOne({ _id: META_ID }, { $set: { settledThrough: roundId } }, { upsert: true })
    }
  }

  /** Settles every trader of a resolved round that still holds its position. True when nothing is left to retry. */
  private async settleRound(roundId: number): Promise<boolean> {
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
        const tx = await this.chain.program.methods
          .settlePlayer()
          .accountsPartial({ arena: this.chain.arena, player: this.chain.playerPda(owner) })
          .transaction()
        const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
        this.settleAttempts.delete(key)
        await this.log('info', 'settle', `Settled ${owner.toBase58()} for round ${roundId}`, sig)
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
          `settlePlayer failed for ${owner.toBase58()} round ${roundId} (attempt ${attempts + 1}${givingUp ? ', giving up' : ''})`,
          signatureOf(error),
          error,
        )
      }
    })
    return complete
  }

  private async processCheers(arena: ArenaAccount, now: number): Promise<void> {
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
        await this.requestCheers(arena, owner)
      }
    }
  }

  private async requestCheers(arena: ArenaAccount, owner: PublicKey): Promise<void> {
    const key = `cheers:${owner.toBase58()}`
    if (this.inBackoff(key)) return
    const candidates = await this.cheersCandidates(arena, owner)
    if (candidates.length === 0) {
      this.quiet(`${key}:empty`, () =>
        void this.log('info', 'cheers', `Cheers pending for ${owner.toBase58()}, but no other recent trader exists on the ER yet`),
      )
      return
    }
    try {
      const seed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      const tx = await this.chain.program.methods
        .requestCheers(seed)
        .accountsPartial({
          payer: this.chain.keeper.publicKey,
          arena: this.chain.arena,
          winner: this.chain.playerPda(owner),
          oracleQueue: VRF_EPHEMERAL_QUEUE,
        })
        .remainingAccounts(candidates.map(pubkey => ({ pubkey, isSigner: false, isWritable: false })))
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      await this.log('info', 'cheers', `Requested VRF cheers for ${owner.toBase58()} with ${candidates.length} candidates`, sig)
    } catch (error) {
      this.backoff(key, RETRY_BACKOFF_MS * 5)
      await this.log('error', 'cheers', `requestCheers failed for ${owner.toBase58()}`, signatureOf(error), error)
    }
  }

  /** Player PDAs of arena.recent owners (minus the winner) that exist on the ER, which the program requires. */
  private async cheersCandidates(arena: ArenaAccount, winner: PublicKey): Promise<PublicKey[]> {
    const seen = new Set<string>()
    const pdas: PublicKey[] = []
    for (const owner of arena.recent) {
      const id = owner.toBase58()
      if (owner.equals(PublicKey.default) || owner.equals(winner) || seen.has(id)) continue
      seen.add(id)
      pdas.push(this.chain.playerPda(owner))
    }
    if (pdas.length === 0) return []
    const infos = await this.chain.er.getMultipleAccountsInfo(pdas, 'confirmed')
    return pdas.filter((_, index) => infos[index]?.owner.equals(this.chain.programId)).slice(0, MAX_CHEERS_CANDIDATES)
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

  private async maybeCommit(arena: ArenaAccount): Promise<void> {
    const latestResolved = arena.history.reduce(
      (max, summary) => (summary.outcome !== 0 ? Math.max(max, toNumber(summary.id)) : max),
      0,
    )
    if (latestResolved === 0 || this.inBackoff('commit')) return
    const meta = await this.cols.meta.findOne({ _id: META_ID })
    // The Arena counts its own commits on chain, including ones sent outside this keeper (bootstrap, scripts);
    // the per-delegation cap applies to that total.
    const commits = Math.max(meta?.commits ?? 0, toNumber(arena.commits))
    if (!shouldCommit(latestResolved, meta?.lastCommitRound ?? 0, commits)) return
    try {
      const tx = await this.chain.program.methods
        .commitArena()
        .accountsPartial({ payer: this.chain.keeper.publicKey, arena: this.chain.arena })
        .transaction()
      const sig = await this.chain.sendErTx(tx, [this.chain.keeper])
      await this.cols.meta.updateOne(
        { _id: META_ID },
        { $set: { lastCommitRound: latestResolved, lastCommitSig: sig, lastCommitAt: Date.now() }, $inc: { commits: 1 } },
        { upsert: true },
      )
      await this.log('info', 'commit', `Committed arena to Solana after round ${latestResolved} (${commits + 1}/${MAX_COMMITS})`, sig)
    } catch (error) {
      this.backoff('commit', COMMIT_BACKOFF_MS)
      await this.log('error', 'commit', 'commitArena failed', signatureOf(error), error)
    }
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
