import { writeClose } from '@/closes'
import { createDreamDexExchange } from '@/dreamdex'
import { errorMessage, isAbortError, sleep } from '@/lib/async'
import { defaultInterval, type IntervalOption } from '@/market'
import { defaultBatchSize, loadPositions, pickBatch, pickBatchSize } from '@/trade/batch'
import { pickIntent } from '@/trade/intent'
import { createPace, defaultPaceMs, nextBeat } from '@/trade/pace'
import { placeTrade } from '@/trade/place'
import { createMarketTape, type MarketSnapshot } from '@/trade/snapshot'
import { defaultCostBounds, resolveCostBounds, type CostBounds, type TradeResult, type WalletPositions } from '@/trade/types'
import { wallets, type BotWallet } from '@/wallets'
import { isBinaryMarket, type SomniaMarkets } from '@somnia-chain/markets-sdk'

export type SimulateTradesOptions = {
  count?: number
  intervalMs?: number
  dryRun?: boolean
  window?: IntervalOption
  cost?: Partial<CostBounds>
  batch?: number
  signal?: AbortSignal
}

const INDEXER_RETRY_MS = 5_000

function formatTrade(result: TradeResult) {
  const tag = result.exit ? result.exit.toUpperCase() : result.side
  const verb = result.dryRun ? 'dry' : result.txHash ? result.txHash.slice(0, 10) : 'sent'
  return `  ${tag.padEnd(8, ' ')}  ${result.cost.toFixed(2).padStart(6, ' ')}  ${result.wallet}  ${result.symbol}  ${verb}`
}

function formatWait(kind: string, waitMs: number) {
  return `  ${kind.padEnd(8, ' ')}  ${(waitMs / 1000).toFixed(1)}s`
}

function snapshotMarketId(snapshot: MarketSnapshot) {
  return isBinaryMarket(snapshot.market.info) ? snapshot.market.info.marketId : snapshot.market.id
}

export async function simulateTrades({
  count,
  intervalMs = defaultPaceMs,
  dryRun = false,
  window = defaultInterval,
  cost,
  batch = defaultBatchSize,
  signal,
}: SimulateTradesOptions = {}) {
  const costBounds = resolveCostBounds(cost)
  const roster = wallets()
  if (roster.length === 0) {
    throw new Error('No generated wallets. Run `bun run generate-wallets` first.')
  }

  const reader = createDreamDexExchange()
  const writers = new Map<string, SomniaMarkets>()
  const tape = createMarketTape(reader, window)
  const pace = createPace()
  let placed = 0
  let lastWallet: BotWallet | undefined

  function writerFor(wallet: BotWallet) {
    const key = wallet.address.toLowerCase()
    const existing = writers.get(key)
    if (existing) return existing

    const writer = createDreamDexExchange({ account: wallet.account })
    writers.set(key, writer)
    return writer
  }

  try {
    while (count === undefined || placed < count) {
      if (signal?.aborted) break

      try {
        const beat = nextBeat(pace, intervalMs)
        if (beat.waitMs > 0) {
          if (!beat.act) console.log(formatWait(beat.kind, beat.waitMs))
          await sleep(beat.waitMs, signal)
        }
        if (signal?.aborted) break
        if (!beat.act) continue

        const snapshot = await tape.current()
        if (!snapshot) {
          console.log(`  waiting for a live BTC ${window} market`)
          continue
        }

        const remaining = count === undefined ? batch : Math.min(batch, count - placed)
        const group = pickBatch(roster, pickBatchSize(remaining), lastWallet, beat.reuseWallet)
        const holdings = await loadPositions(
          reader,
          group.map((wallet) => wallet.address),
          snapshotMarketId(snapshot),
          snapshot.onchain.decimals,
        )

        const results = await Promise.all(
          group.map((wallet, index) => {
            const positions = holdings[index]
            if (!positions) return Promise.resolve(undefined)
            return tradeOne(writerFor(wallet), wallet, snapshot, positions, dryRun, costBounds)
          }),
        )

        for (const [index, result] of results.entries()) {
          if (!result) continue
          lastWallet = group[index] ?? lastWallet
          placed += 1
        }
      } catch (error) {
        if (isAbortError(error, signal)) break
        console.error(`  retry    ${errorMessage(error)}`)
        try {
          await sleep(INDEXER_RETRY_MS, signal)
        } catch (retryError) {
          if (isAbortError(retryError, signal)) break
        }
      }
    }

    return placed
  } finally {
    await Promise.all([reader.close(), ...[...writers.values()].map((writer) => writer.close())])
  }
}

async function tradeOne(
  writer: SomniaMarkets,
  wallet: BotWallet,
  snapshot: MarketSnapshot,
  positions: WalletPositions,
  dryRun: boolean,
  costBounds: CostBounds = defaultCostBounds,
): Promise<TradeResult | undefined> {
  try {
    const intent = pickIntent(wallet.address, positions, snapshot.prices, Math.random, costBounds)
    if (!intent) {
      console.log(
        `  skip    ${wallet.address}  collateral ${positions.collateral.toFixed(2)}  need > ${costBounds.min} and ≤ ${costBounds.limit}`,
      )
      return undefined
    }

    const result = await placeTrade(writer, wallet, snapshot.market, intent, {
      dryRun,
      cost: costBounds,
      snapshot,
      positions,
    })
    if (result.exit && !result.dryRun) {
      const shares = intent.outcome === 'YES' ? positions.yes : positions.no
      const pnl = positions.unrealizedPnl ?? 0
      await writeClose({
        marketId: result.marketId,
        trader: result.wallet,
        outcome: intent.outcome,
        exit: result.exit,
        profit: pnl,
        shares,
        t: Date.now(),
      }).catch((error) => {
        console.error(`  close    ${result.wallet}  ${errorMessage(error)}`)
      })
    }
    console.log(formatTrade(result))
    return result
  } catch (error) {
    console.error(`  fail    ${wallet.address}  ${errorMessage(error)}`)
    return undefined
  }
}
