import { describe, expect, test } from 'bun:test'
import {
  createBotHeart,
  nextBotHeartRate,
  toTrader,
  traderHeartRateClears,
  traderHeartRateUpdates,
  traderKey,
  traderPresenceUpdates,
  traderUpdates,
} from '../traders'

const nova = {
  index: 0,
  address: '0x1111111111111111111111111111111111111111' as const,
}

const kira = {
  index: 1,
  address: '0x2222222222222222222222222222222222222222' as const,
}

describe('toTrader', () => {
  test('uses the wallet display name, requested status, and lastSeen', () => {
    expect(toTrader(nova, 'online', 1_000)).toEqual({
      address: nova.address,
      name: 'nova',
      status: 'online',
      lastSeen: 1_000,
    })
    expect(toTrader(kira, 'offline', 2_000)).toEqual({
      address: kira.address,
      name: 'kira',
      status: 'offline',
      lastSeen: 2_000,
    })
  })

  test('attaches a live heart rate when the trader is online', () => {
    expect(toTrader(nova, 'online', 1_000, { bpm: 72, rest: 58 })).toEqual({
      address: nova.address,
      name: 'nova',
      status: 'online',
      lastSeen: 1_000,
      heartRate: 72,
      heartRateAt: 1_000,
    })
    expect(toTrader(nova, 'offline', 1_000, { bpm: 72, rest: 58 }).heartRate).toBeUndefined()
  })
})

describe('traderUpdates', () => {
  test('keys each wallet under /traders by a safe address', () => {
    expect(traderUpdates([nova, kira], 'online', 1_000)).toEqual({
      [traderKey(nova.address)]: {
        address: nova.address,
        name: 'nova',
        status: 'online',
        lastSeen: 1_000,
      },
      [traderKey(kira.address)]: {
        address: kira.address,
        name: 'kira',
        status: 'online',
        lastSeen: 1_000,
      },
    })
  })
})

function seq(...values: number[]) {
  let index = 0
  return () => values[index++] ?? 0
}

describe('createBotHeart', () => {
  test('assigns a resting bpm from the wallet index', () => {
    expect(createBotHeart(0)).toEqual({ bpm: 58, rest: 58 })
    expect(createBotHeart(1)).toEqual({ bpm: 63, rest: 63 })
  })
})

describe('nextBotHeartRate', () => {
  const rest = { bpm: 70, rest: 70 }

  test('wanders, drifts back, or spikes from a known roll', () => {
    expect(nextBotHeartRate(rest, seq(0.5, 0.5))).toEqual({ bpm: 70, rest: 70 })
    expect(nextBotHeartRate(rest, seq(0.1, 0.5))).toEqual({ bpm: 71, rest: 70 })
    expect(nextBotHeartRate(rest, seq(0, 0))).toEqual({ bpm: 75, rest: 70 })
  })

  test('stays inside the rest band even after repeated spikes', () => {
    let heart = rest
    const spike = seq(...Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 0 : 0.999)))
    for (let step = 0; step < 20; step++) heart = nextBotHeartRate(heart, spike)
    expect(heart).toEqual({ bpm: 94, rest: 70 })
  })
})

describe('traderHeartRateUpdates', () => {
  test('writes bpm and timestamp under each known trader key', () => {
    const hearts = new Map([[traderKey(nova.address), { bpm: 72, rest: 58 }]])

    expect(traderHeartRateUpdates([nova, kira], hearts, 1_000)).toEqual({
      [`${traderKey(nova.address)}/heartRate`]: 72,
      [`${traderKey(nova.address)}/heartRateAt`]: 1_000,
    })
  })

  test('clears bpm fields so a disconnect drops the reading', () => {
    expect(traderHeartRateClears([nova])).toEqual({
      [`${traderKey(nova.address)}/heartRate`]: null,
      [`${traderKey(nova.address)}/heartRateAt`]: null,
    })
  })
})

describe('traderPresenceUpdates', () => {
  const novaKey = traderKey(nova.address)

  test('merges presence and a live heart rate without replacing the trader node', () => {
    const hearts = new Map([[novaKey, { bpm: 72, rest: 58 }]])

    expect(traderPresenceUpdates([nova], 'online', 1_000, { sessionId: 'bot-1', hearts })).toEqual({
      [`${novaKey}/address`]: nova.address,
      [`${novaKey}/name`]: 'nova',
      [`${novaKey}/status`]: 'online',
      [`${novaKey}/lastSeen`]: 1_000,
      [`${novaKey}/sessions/bot-1`]: 1_000,
      [`${novaKey}/heartRate`]: 72,
      [`${novaKey}/heartRateAt`]: 1_000,
    })
  })

  test('clears heart rate when the roster goes offline', () => {
    expect(traderPresenceUpdates([nova], 'offline', 2_000, { sessionId: 'bot-1' })).toMatchObject({
      [`${novaKey}/status`]: 'offline',
      [`${novaKey}/heartRate`]: null,
      [`${novaKey}/heartRateAt`]: null,
    })
  })
})
