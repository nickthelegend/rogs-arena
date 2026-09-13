import { describe, expect, test } from 'bun:test'
import type { ArenaSnapshot, ChatDto, RoundDto, TradeDto } from '../arena-api'
import {
  applyRoundData,
  applyServerMessage,
  applySnapshot,
  CHAT_KEEP,
  initialArenaRealtimeState,
  loadKey,
  parseServerMessage,
  roundDataError,
  roundDataStatus,
  roundIdsFromMarketIds,
  ROUND_DATA_KEEP,
} from '../arena-store'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
const otherWallet = '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr'

function round(roundId: number, overrides: Partial<RoundDto> = {}): RoundDto {
  return {
    roundId,
    startTs: 1_788_844_200 + roundId * 300,
    endTs: 1_788_844_500 + roundId * 300,
    strikePrice: '7725512345678',
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

function trade(id: string, roundId: number, t: number, owner = wallet): TradeDto {
  return {
    id,
    sig: id.split(':')[0] ?? id,
    roundId,
    owner,
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

function chat(index: number): ChatDto {
  return { id: `chat-${index}`, address: wallet, name: 'nova', message: `gm ${index}`, t: 1_000 + index }
}

function snapshot(overrides: Partial<ArenaSnapshot> = {}): ArenaSnapshot {
  return {
    round: round(10),
    recentRounds: [round(9, { outcome: 'NO', closePrice: '7700000000000' })],
    trades: [trade('b:0', 10, 2_000), trade('a:0', 10, 1_000, otherWallet)],
    points: [{ roundId: 10, t: 1_500, yes: 0.52, no: 0.48, source: 'chain' }],
    closes: [],
    traders: [
      {
        address: wallet,
        name: 'nova',
        status: 'online',
        lastSeen: 9_000,
        heartRate: 88,
        heartRateAt: 8_500,
        isBot: false,
      },
    ],
    anonymous: 2,
    online: 3,
    chat: [chat(1)],
    cheers: [],
    serverTime: 10_000,
    ...overrides,
  }
}

describe('applySnapshot', () => {
  test('seeds the current round and marks its trades, points, and closes as loaded', () => {
    const state = applySnapshot(initialArenaRealtimeState(), snapshot(), 9_000)

    expect(state.snapshotStatus).toBe('ready')
    expect(state.round?.roundId).toBe(10)
    expect(state.rounds.map((item) => item.roundId)).toEqual([10, 9])
    expect(state.trades[10]?.map((item) => item.id)).toEqual(['a:0', 'b:0'])
    expect(state.points[10]).toHaveLength(1)
    expect(roundDataStatus(state.loads, 'trades', [10])).toBe('live')
    expect(roundDataStatus(state.loads, 'closes', [10])).toBe('live')
    expect(state.serverTimeOffsetMs).toBe(1_000)
    expect(state.online).toBe(3)
  })

  test('ignores a snapshot older than the one already applied', () => {
    const newer = applySnapshot(initialArenaRealtimeState(), snapshot({ round: round(11), serverTime: 20_000 }), 20_000)
    const stale = applySnapshot(newer, snapshot({ round: round(10), serverTime: 15_000 }), 21_000)

    expect(stale).toBe(newer)
    expect(stale.round?.roundId).toBe(11)
  })
})

describe('applyServerMessage', () => {
  test('dedupes a replayed trade by id and keeps ascending time', () => {
    const seeded = applySnapshot(initialArenaRealtimeState(), snapshot(), 9_000)
    const once = applyServerMessage(seeded, { type: 'trade', trade: trade('c:0', 10, 1_500) }, 9_100)
    const twice = applyServerMessage(once, { type: 'trade', trade: trade('c:0', 10, 1_500) }, 9_200)

    expect(twice.trades[10]?.map((item) => item.id)).toEqual(['a:0', 'c:0', 'b:0'])
  })

  test('a newly opened round drops data for rounds outside the keep window', () => {
    let state = applySnapshot(initialArenaRealtimeState(), snapshot(), 9_000)
    state = applyRoundData(state, { kind: 'trades', roundId: 10 - ROUND_DATA_KEEP, items: [trade('old:0', 6, 10)] })

    state = applyServerMessage(state, { type: 'round', round: round(11) }, 9_500)

    expect(state.round?.roundId).toBe(11)
    expect(state.trades[10 - ROUND_DATA_KEEP]).toBeUndefined()
    expect(state.trades[10]).toHaveLength(2)
  })

  test('a resolved older round updates history without replacing the live round', () => {
    const seeded = applySnapshot(initialArenaRealtimeState(), snapshot(), 9_000)
    const state = applyServerMessage(
      seeded,
      { type: 'round', round: round(9, { outcome: 'YES', closePrice: '7800000000000' }) },
      9_100,
    )

    expect(state.round?.roundId).toBe(10)
    expect(state.rounds.find((item) => item.roundId === 9)?.outcome).toBe('YES')
  })

  test('keeps only the newest chat messages', () => {
    let state = initialArenaRealtimeState()
    for (let index = 0; index < CHAT_KEEP + 5; index++) {
      state = applyServerMessage(state, { type: 'chat', message: chat(index) }, 1)
    }

    expect(state.chat).toHaveLength(CHAT_KEEP)
    expect(state.chat[0]?.id).toBe('chat-5')
  })

  test('replaces the roster and counts on a traders frame', () => {
    const state = applyServerMessage(
      initialArenaRealtimeState(),
      { type: 'traders', traders: [], anonymous: 4, online: 4 },
      1,
    )

    expect(state).toMatchObject({ traders: [], anonymous: 4, online: 4 })
  })

  test('records a server error frame', () => {
    const state = applyServerMessage(initialArenaRealtimeState(), { type: 'error', error: 'Sign in to chat' }, 1)
    expect(state.serverError).toBe('Sign in to chat')
  })
})

describe('round data helpers', () => {
  test('reads round ids from decimal market ids only', () => {
    expect(roundIdsFromMarketIds(['12', '0xabc', '12', '7', ''])).toEqual([7, 12])
  })

  test('reports loading, live, and error per requested round', () => {
    const loads = {
      [loadKey('trades', 1)]: { status: 'ready' as const, error: null },
      [loadKey('trades', 2)]: { status: 'loading' as const, error: null },
      [loadKey('trades', 3)]: { status: 'error' as const, error: 'Could not load trades for round 3: offline' },
    }

    expect(roundDataStatus(loads, 'trades', [])).toBe('live')
    expect(roundDataStatus(loads, 'trades', [1])).toBe('live')
    expect(roundDataStatus(loads, 'trades', [1, 2])).toBe('loading')
    expect(roundDataStatus(loads, 'trades', [1, 2, 3])).toBe('error')
    expect(roundDataError(loads, 'trades', [3])).toBe('Could not load trades for round 3: offline')
  })

  test('accepts only known server frame types', () => {
    expect(parseServerMessage({ type: 'trade', trade: trade('x:0', 1, 1) })?.type).toBe('trade')
    expect(parseServerMessage({ type: 'future-thing' })).toBeNull()
    expect(parseServerMessage('trade')).toBeNull()
  })
})
