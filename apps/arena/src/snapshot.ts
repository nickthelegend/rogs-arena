import { listChat } from './chat'
import type { Collections } from './db'
import type { Presence } from './presence'
import { listCheers, listCloses, listPoints, listRounds, listTrades } from './store'
import type { ArenaSnapshot, CloseDto, PointDto, TradeDto } from './types'

export async function buildSnapshot(cols: Collections, presence: Presence, now = Date.now()): Promise<ArenaSnapshot> {
  const [recentRounds, chat, cheers] = await Promise.all([listRounds(cols, 96), listChat(cols, 50), listCheers(cols, 20)])
  const round = recentRounds[0] ?? null
  let trades: TradeDto[] = []
  let points: PointDto[] = []
  let closes: CloseDto[] = []
  if (round) {
    ;[trades, points, closes] = await Promise.all([
      listTrades(cols, round.roundId, 400),
      listPoints(cols, round.roundId, 2_000),
      listCloses(cols, round.roundId),
    ])
  }
  const { traders, anonymous, online } = presence.list()
  return { round, recentRounds, trades, points, closes, traders, anonymous, online, chat, cheers, serverTime: now }
}
