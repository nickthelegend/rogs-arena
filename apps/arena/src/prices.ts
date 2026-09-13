import { decodePriceUpdate, type OraclePrice } from '@rogs/arena-sdk'
import type { Connection } from '@solana/web3.js'
import type { Collections, PriceDoc } from './db'
import { isDuplicateKey } from './errors'
import type { Market } from './markets'
import type { PricePointDto, ServiceStatus } from './types'
import { errorMessage, sleep, throttled } from './util'

export const PRICE_SAMPLE_MS = 2_000
/** Stored points expire this long after their publish time (TTL index), and queries never reach further back. */
export const PRICE_RETENTION_MS = 6 * 60 * 60_000
/** A query without `since` covers the web chart's largest window. */
export const PRICE_DEFAULT_LOOKBACK_MS = 60 * 60_000
export const PRICE_QUERY_LIMIT = 2_000

/** The one ER call the sampler makes per tick. */
export type FeedReader = Pick<Connection, 'getMultipleAccountsInfo'>

/**
 * The point to store for one market's oracle read, or null when the feed's publish time did not advance past the
 * last stored one (it was not republished between two samples) or the read carries no usable price.
 */
export function samplePrice(
  market: string,
  price: Pick<OraclePrice, 'price' | 'publishTime'>,
  lastPublishTime: number | undefined,
): PriceDoc | null {
  if (!Number.isSafeInteger(price.publishTime) || price.publishTime <= 0) return null
  if (lastPublishTime !== undefined && price.publishTime <= lastPublishTime) return null
  if (!Number.isFinite(price.price) || price.price <= 0) return null
  const t = price.publishTime * 1000
  return { market, t, price: price.price, expiresAt: new Date(t + PRICE_RETENTION_MS) }
}

/** The oldest `t` a price query returns: `since` (an hour ago when missing), clamped to the retention window. */
export const priceWindowStart = (since: number | undefined, now: number): number =>
  Math.max(since ?? now - PRICE_DEFAULT_LOOKBACK_MS, now - PRICE_RETENTION_MS)

/** Writes each point once per market and publish time; a point already stored (another instance) is skipped. */
export async function savePrices(cols: Collections, points: readonly PriceDoc[]): Promise<number> {
  if (!points.length) return 0
  try {
    const result = await cols.prices.bulkWrite(
      points.map(point => ({
        updateOne: { filter: { market: point.market, t: point.t }, update: { $setOnInsert: point }, upsert: true },
      })),
      { ordered: false },
    )
    return result.upsertedCount
  } catch (error) {
    // Two writers racing on the same upsert collide on the unique index; the other writes still applied.
    if (isDuplicateKey(error)) return 0
    throw error
  }
}

/** A market's stored prices from `since`, ascending `t`; when more match, the newest PRICE_QUERY_LIMIT of them. */
export async function listPrices(
  cols: Collections,
  market: string,
  since: number | undefined,
  now = Date.now(),
): Promise<PricePointDto[]> {
  const docs = await cols.prices
    .find({ market, t: { $gte: priceWindowStart(since, now) } }, { projection: { _id: 0, t: 1, price: 1 } })
    .sort({ t: -1 })
    .limit(PRICE_QUERY_LIMIT)
    // One batch instead of the driver's default 101 rows per round trip: an hour of history is about 1,800 rows.
    .batchSize(PRICE_QUERY_LIMIT)
    .toArray()
  return docs.reverse() as PricePointDto[]
}

/**
 * Recent prices per market in memory, fed by the sampler, so chart backfills do not wait on the database. An hour of
 * history is about 1,800 rows and took seconds over a remote Atlas link, long enough for a few coin switches at once to
 * hit the HTTP idle timeout. A window is answered only if this history covers all of it: from when the process
 * started, or an hour back once that market was preloaded from Mongo. Anything older falls back to the database.
 */
export class PriceHistory {
  private readonly points = new Map<string, PricePointDto[]>()
  private readonly coveredFrom = new Map<string, number>()
  private readonly startedAt: number

  constructor(private readonly clock: () => number = Date.now) {
    this.startedAt = clock()
  }

  /** Appends a sampled point. Repeated or out-of-order publish times are ignored; points past retention are dropped. */
  add(point: { market: string; t: number; price: number }): void {
    const points = this.points.get(point.market) ?? []
    const last = points.at(-1)
    if (last && point.t <= last.t) return
    points.push({ t: point.t, price: point.price })
    const firstKept = firstIndexAtOrAfter(points, this.clock() - PRICE_RETENTION_MS)
    this.points.set(point.market, firstKept ? points.slice(firstKept) : points)
  }

  /** Loads each market's stored last hour, one market at a time. A market that fails keeps its narrower coverage. */
  async preload(cols: Collections, markets: readonly string[]): Promise<{ loaded: number; failed: string[] }> {
    let loaded = 0
    const failed: string[] = []
    for (const market of markets) {
      const now = this.clock()
      const from = now - PRICE_DEFAULT_LOOKBACK_MS
      try {
        const stored = await listPrices(cols, market, from, now)
        // Points sampled while the query ran are newer than, or equal to, the stored ones they overlap.
        const live = this.points.get(market) ?? []
        const firstLive = live[0]?.t ?? Number.POSITIVE_INFINITY
        this.points.set(market, [...stored.filter(point => point.t < firstLive), ...live])
        this.coveredFrom.set(market, Math.min(from, this.coverageStart(market)))
        loaded += stored.length
      } catch (error) {
        failed.push(`${market} (${errorMessage(error)})`)
      }
    }
    return { loaded, failed }
  }

  /** The window from `since` under the same rules as the database query, or null when it is not fully covered. */
  list(market: string, since: number | undefined, now = this.clock()): PricePointDto[] | null {
    const from = priceWindowStart(since, now)
    if (from < this.coverageStart(market)) return null
    const points = this.points.get(market) ?? []
    return points.slice(Math.max(firstIndexAtOrAfter(points, from), points.length - PRICE_QUERY_LIMIT))
  }

  private coverageStart(market: string): number {
    return this.coveredFrom.get(market) ?? this.startedAt
  }
}

function firstIndexAtOrAfter(points: readonly PricePointDto[], t: number): number {
  let low = 0
  let high = points.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (points[middle]!.t < t) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * Records every market's MagicBlock oracle price for the web chart's history. Every 2 s it reads all feed accounts
 * on the ER in one getMultipleAccountsInfo call and stores a point for each feed whose publish time advanced.
 */
export class PriceSampler {
  private timer: ReturnType<typeof setInterval> | null = null
  private sampling = false
  private readonly lastPublish = new Map<string, number>()
  private readonly warn = throttled(30_000)

  constructor(
    private readonly er: FeedReader,
    private readonly markets: readonly Market[],
    private readonly cols: Collections,
    private readonly status: ServiceStatus,
    private readonly history: PriceHistory | null = null,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.sample(), PRICE_SAMPLE_MS)
    console.log(
      `[prices] sampling ${this.markets.length} oracle feeds (${this.markets.map(market => market.symbol).join(', ')}) on the ER every ${PRICE_SAMPLE_MS}ms`,
    )
    void this.sample()
    if (this.history) {
      const startedAt = Date.now()
      void this.history.preload(this.cols, this.markets.map(market => market.symbol)).then(({ loaded, failed }) =>
        console.log(
          `[prices] preloaded ${loaded} stored points into memory in ${Date.now() - startedAt}ms${failed.length ? `; not loaded: ${failed.join(', ')}` : ''}`,
        ),
      )
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    const deadline = Date.now() + 5_000
    while (this.sampling && Date.now() < deadline) await sleep(50)
  }

  /** One tick. Returns how many points it stored; RPC and write failures are logged (throttled) and retried next tick. */
  async sample(): Promise<number> {
    if (this.sampling) return 0
    this.sampling = true
    try {
      const accounts = await this.er.getMultipleAccountsInfo(
        this.markets.map(market => market.oracleFeed),
        'confirmed',
      )
      const points: PriceDoc[] = []
      this.markets.forEach((market, index) => {
        const account = accounts[index]
        if (!account) {
          this.warn(`missing:${market.symbol}`, () =>
            console.warn(`[prices] ${market.symbol} feed ${market.oracleFeed.toBase58()} was not found on the ER`),
          )
          return
        }
        try {
          const price = decodePriceUpdate(market.oracleFeed, account.data, account.owner)
          const point = samplePrice(market.symbol, price, this.lastPublish.get(market.symbol))
          if (point) points.push(point)
        } catch (error) {
          this.warn(`decode:${market.symbol}`, () =>
            console.warn(`[prices] ${market.symbol} feed could not be read: ${errorMessage(error)}`),
          )
        }
      })
      if (!points.length) return 0
      // Memory first, so backfills see the point even if the write fails; the re-read next tick is ignored as a repeat.
      for (const point of points) this.history?.add(point)
      const stored = await savePrices(this.cols, points)
      // Advanced only after the write, so a point whose write failed is written next tick if the feed has not moved.
      for (const point of points) this.lastPublish.set(point.market, point.t / 1000)
      this.status.prices.lastSampleAt = Date.now()
      return stored
    } catch (error) {
      this.warn('sample', () => console.warn(`[prices] sample failed: ${errorMessage(error)}`))
      return 0
    } finally {
      this.sampling = false
    }
  }
}
