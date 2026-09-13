import type { MarketArena } from './chain'
import { listChat } from './chat'
import { roundStatusLabel } from './constants'
import type { Collections } from './db'
import { toNumber } from './mappers'
import type { Market } from './markets'
import type { Presence } from './presence'
import { listCheers, listCloses, listPoints, listRounds, listTrades } from './store'
import type { ArenaSnapshot, CloseDto, HealthMarketDto, MarketDto, PointDto, RoundDto, TradeDto } from './types'

/** One market's rounds, trades, points and closes, plus the global traders, chat and cheers. */
export async function buildSnapshot(cols: Collections, presence: Presence, market: string, now = Date.now()): Promise<ArenaSnapshot> {
  const [recentRounds, chat, cheers] = await Promise.all([listRounds(cols, market, 96), listChat(cols, 50), listCheers(cols, 20)])
  const round = recentRounds[0] ?? null
  let trades: TradeDto[] = []
  let points: PointDto[] = []
  let closes: CloseDto[] = []
  if (round) {
    ;[trades, points, closes] = await Promise.all([
      listTrades(cols, market, round.roundId, 400),
      listPoints(cols, market, round.roundId, 2_000),
      listCloses(cols, market, round.roundId),
    ])
  }
  const { traders, anonymous, online } = presence.list()
  return { market, round, recentRounds, trades, points, closes, traders, anonymous, online, chat, cheers, serverTime: now }
}

/**
 * `/api/markets` rows in MARKETS order. `arenas` is the ER read (null if the ER could not be read at all);
 * `rounds[i]` is market i's newest indexed round.
 */
export function toMarketDtos(markets: readonly Market[], arenas: readonly MarketArena[] | null, rounds: readonly (RoundDto | null)[]): MarketDto[] {
  return markets.map((market, index) => ({
    market: market.symbol,
    id: market.id,
    name: market.name,
    color: market.color,
    priceDecimals: market.priceDecimals,
    arena: market.arena.toBase58(),
    oracleFeed: market.oracleFeed.toBase58(),
    available: Boolean(arenas?.[index]?.account),
    round: rounds[index] ?? null,
  }))
}

/** `/health` market rows straight from the ER arena accounts. */
export function toHealthMarkets(markets: readonly Market[], arenas: readonly MarketArena[] | null): HealthMarketDto[] {
  return markets.map((market, index) => {
    const account = arenas?.[index]?.account
    if (!account) return { market: market.symbol, available: false, roundId: null, status: null, endTs: null }
    return {
      market: market.symbol,
      available: true,
      roundId: toNumber(account.current.id),
      status: roundStatusLabel(account.current.status),
      endTs: toNumber(account.current.endTs),
    }
  })
}
