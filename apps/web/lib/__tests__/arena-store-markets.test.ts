import { describe, expect, test } from 'bun:test'
import { MARKET_ROUND_BASE } from '@rogs/arena-sdk'
import type { ArenaSnapshot, ChatDto, CloseDto, PointDto, RoundDto, SettlementDto, TradeDto } from '../arena-api'
import {
  applyRoundData,
  applyServerMessage,
  applySnapshot,
  belongsToMarket,
  initialArenaRealtimeState,
  roundDataStatus,
  selectArenaMarket,
} from '../arena-store'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
const ETH = MARKET_ROUND_BASE
const SOL = 2 * MARKET_ROUND_BASE

function round(roundId: number, overrides: Partial<RoundDto> = {}): RoundDto {
  return {
    roundId,
    startTs: 1_789_274_400,
    endTs: 1_789_274_700,
    strikePrice: '10167872455',
    closePrice: null,
    priceExpo: 8,
    outcome: null,
    yesPool: 200,
    noPool: 200,
    volume: 0,
    trades: 0,
    openedSig: `open-${roundId}`,
    resolvedSig: null,
    ...overrides,
  }
}

function trade(id: string, roundId: number, t: number, market?: string): TradeDto {
  return {
    ...(market ? { market } : {}),
    id,
    sig: id.split(':')[0] ?? id,
    roundId,
    owner: wallet,
    side: 'BUY',
    outcome: 'YES',
    amount: 2,
    shares: 3.9,
    price: 0.51,
    yesPrice: 0.52,
    fee: 0.02,
    realizedPnl: 0,
    ability: 0,
    t,
  }
}

function point(roundId: number, t: number, market?: string): PointDto {
  return { ...(market ? { market } : {}), roundId, t, yes: 0.5, no: 0.5, source: 'chain' }
}

function close(id: string, roundId: number, market?: string): CloseDto {
  return { ...(market ? { market } : {}), id, roundId, trader: wallet, outcome: 'YES', exit: 'tp', profit: 1, shares: 2, t: 5 }
}

function settlement(id: string, roundId: number, market?: string): SettlementDto {
  return {
    ...(market ? { market } : {}),
    id,
    sig: id,
    roundId,
    owner: wallet,
    outcome: 'YES',
    payout: 4,
    profit: 2,
    ability: 0,
    bonus: 0,
    calm: false,
    cheers: false,
    t: 7,
  }
}

function chat(index: number): ChatDto {
  return { id: `chat-${index}`, address: wallet, name: 'nova', message: `gm ${index}`, t: index }
}

/** The single-market service's snapshot: BTC, no `market` anywhere. */
function btcSnapshot(overrides: Partial<ArenaSnapshot> = {}): ArenaSnapshot {
  return {
    round: round(67),
    recentRounds: [round(66, { outcome: 'NO' })],
    trades: [trade('b:0', 67, 1_000)],
    points: [point(67, 1_000)],
    closes: [],
    traders: [],
    anonymous: 1,
    online: 1,
    chat: [chat(1)],
    cheers: [],
    serverTime: 10_000,
    ...overrides,
  }
}

function solSnapshot(overrides: Partial<ArenaSnapshot> = {}): ArenaSnapshot {
  return btcSnapshot({
    market: 'SOL',
    round: round(SOL + 12, { market: 'SOL' }),
    recentRounds: [round(SOL + 11, { market: 'SOL', outcome: 'YES' }), round(66)],
    trades: [trade('s:0', SOL + 12, 1_000, 'SOL'), trade('b:0', 67, 1_100)],
    points: [point(SOL + 12, 1_000, 'SOL')],
    ...overrides,
  })
}

const onSol = () => selectArenaMarket(initialArenaRealtimeState(), 'SOL')

describe('market-scoped snapshots', () => {
  test('a snapshot without market is BTC and seeds the BTC board', () => {
    const state = applySnapshot(initialArenaRealtimeState(), btcSnapshot(), 9_000)

    expect(state.market).toBe('BTC')
    expect(state.round?.roundId).toBe(67)
    expect(state.trades[67]).toHaveLength(1)
    expect(roundDataStatus(state.loads, 'trades', [67])).toBe('live')
  })

  test('on SOL, a BTC-only snapshot brings chat and traders but no rounds', () => {
    const state = applySnapshot(onSol(), btcSnapshot(), 9_000)

    expect(state.snapshotStatus).toBe('ready')
    expect(state.chat.map((item) => item.id)).toEqual(['chat-1'])
    expect(state.round).toBeNull()
    expect(state.rounds).toEqual([])
    expect(state.trades).toEqual({})
    expect(state.points).toEqual({})
    expect(roundDataStatus(state.loads, 'trades', [67])).toBe('loading')
  })

  test('a SOL snapshot seeds only SOL rounds and rows', () => {
    const state = applySnapshot(onSol(), solSnapshot(), 9_000)

    expect(state.round?.roundId).toBe(SOL + 12)
    expect(state.rounds.map((item) => item.roundId)).toEqual([SOL + 12, SOL + 11])
    expect(Object.keys(state.trades).map(Number)).toEqual([SOL + 12])
    expect(state.trades[SOL + 12]?.map((item) => item.id)).toEqual(['s:0'])
    expect(roundDataStatus(state.loads, 'points', [SOL + 12])).toBe('live')
  })

  test('a newer BTC snapshot arriving after the switch to SOL keeps the SOL round', () => {
    const seeded = applySnapshot(onSol(), solSnapshot(), 9_000)
    const state = applySnapshot(seeded, btcSnapshot({ serverTime: 11_000, chat: [chat(2)] }), 10_900)

    expect(state.round?.roundId).toBe(SOL + 12)
    expect(state.trades[SOL + 12]).toHaveLength(1)
    expect(state.chat.map((item) => item.id)).toEqual(['chat-1', 'chat-2'])
  })
})

describe('switching coins', () => {
  test('drops the previous coin round data and keeps chat, traders and settlements', () => {
    let state = applySnapshot(initialArenaRealtimeState(), btcSnapshot(), 9_000)
    state = applyServerMessage(state, { type: 'settlement', settlement: settlement('btc:0', 66) }, 9_100)

    const switched = selectArenaMarket(state, 'SOL')

    expect(switched.market).toBe('SOL')
    expect(switched.round).toBeNull()
    expect(switched.rounds).toEqual([])
    expect(switched.trades).toEqual({})
    expect(switched.loads).toEqual({})
    expect(switched.chat).toHaveLength(1)
    expect(switched.settlements.map((item) => item.id)).toEqual(['btc:0'])
    expect(switched.snapshotStatus).toBe('ready')
    expect(selectArenaMarket(switched, 'SOL')).toBe(switched)
  })
})

describe('broadcast frames on a coin board', () => {
  test('keeps the selected coin only; a frame without market is BTC', () => {
    let state = applySnapshot(onSol(), solSnapshot({ trades: [], points: [], recentRounds: [] }), 9_000)
    state = applyServerMessage(state, { type: 'trade', trade: trade('b:1', 67, 2_000) }, 9_100)
    state = applyServerMessage(state, { type: 'trade', trade: trade('e:1', ETH + 3, 2_000, 'ETH') }, 9_100)
    state = applyServerMessage(state, { type: 'trade', trade: trade('s:1', SOL + 12, 2_000, 'SOL') }, 9_100)
    state = applyServerMessage(state, { type: 'point', point: point(67, 2_000) }, 9_100)
    state = applyServerMessage(state, { type: 'point', point: point(SOL + 12, 2_000, 'SOL') }, 9_100)
    state = applyServerMessage(state, { type: 'close', close: close('b:2', 67) }, 9_100)
    state = applyServerMessage(state, { type: 'round', round: round(68) }, 9_200)

    expect(Object.keys(state.trades).map(Number)).toEqual([SOL + 12])
    expect(state.trades[SOL + 12]?.map((item) => item.id)).toEqual(['s:1'])
    expect(Object.keys(state.points).map(Number)).toEqual([SOL + 12])
    expect(state.closes).toEqual({})
    expect(state.round?.roundId).toBe(SOL + 12)
  })

  test('the next SOL round frame advances the SOL board', () => {
    const seeded = applySnapshot(onSol(), solSnapshot(), 9_000)
    const state = applyServerMessage(seeded, { type: 'round', round: round(SOL + 13, { market: 'SOL' }) }, 9_500)

    expect(state.round?.roundId).toBe(SOL + 13)
    expect(state.rounds[0]?.roundId).toBe(SOL + 13)
  })

  test('the wallet keeps settlements from every coin', () => {
    let state = onSol()
    state = applyServerMessage(state, { type: 'settlement', settlement: settlement('btc:0', 66) }, 1)
    state = applyServerMessage(state, { type: 'settlement', settlement: settlement('eth:0', ETH + 2, 'ETH') }, 2)

    expect(state.settlements.map((item) => item.id)).toEqual(['eth:0', 'btc:0'])
  })

  test('fetched round data for another coin, or rows of another round, are ignored', () => {
    expect(applyRoundData(onSol(), { kind: 'trades', roundId: 67, items: [trade('b:0', 67, 1)] }).trades).toEqual({})

    const state = applyRoundData(onSol(), {
      kind: 'trades',
      roundId: SOL + 4,
      items: [trade('s:0', SOL + 4, 1, 'SOL'), trade('b:0', 67, 1), trade('s:9', SOL + 5, 1, 'SOL')],
    })
    expect(state.trades[SOL + 4]?.map((item) => item.id)).toEqual(['s:0'])
  })

  test('a row counts only when its ticker and its round id agree', () => {
    expect(belongsToMarket({ roundId: 67 }, 'BTC')).toBe(true)
    expect(belongsToMarket({ market: 'sol', roundId: SOL + 1 }, 'SOL')).toBe(true)
    expect(belongsToMarket({ market: 'SOL', roundId: 67 }, 'SOL')).toBe(false)
    expect(belongsToMarket({ roundId: SOL + 1 }, 'SOL')).toBe(false)
    expect(belongsToMarket({ market: 'PEPE', roundId: SOL + 1 }, 'SOL')).toBe(false)
  })
})
