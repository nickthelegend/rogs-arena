import { describe, expect, test } from 'bun:test'
import {
  formatTraderCount,
  isTraderOnline,
  liveTraderHeartRate,
  onlineTraderCount,
  parseHeartRateBpm,
  parseTraders,
  traderHeartRateUpdate,
  traderIdentity,
  traderKey,
  type Trader,
} from '../traders'

function trader(overrides: Partial<Trader> = {}): Trader {
  return {
    address: '0x1111111111111111111111111111111111111111',
    name: 'nova',
    status: 'online',
    ...overrides,
  }
}

describe('traderKey', () => {
  test('lowercases and strips firebase-forbidden characters', () => {
    expect(traderKey('0xAbC.def#1$[x]/Y')).toBe('0xabc_def_1__x__y')
  })
})

describe('parseTraders', () => {
  test('reads roster entries and the anonymous counter', () => {
    const snapshot = parseTraders({
      '0x1111111111111111111111111111111111111111': trader(),
      '0x2222222222222222222222222222222222222222': trader({
        address: '0x2222222222222222222222222222222222222222',
        name: 'kira',
        status: 'offline',
      }),
      anonymous: 4,
    })

    expect(snapshot.anonymous).toBe(4)
    expect(snapshot.traders).toEqual([
      trader(),
      trader({
        address: '0x2222222222222222222222222222222222222222',
        name: 'kira',
        status: 'offline',
      }),
    ])
  })

  test('drops invalid rows and clamps a negative anonymous count', () => {
    expect(
      parseTraders({
        anonymous: -3.8,
        bad: { address: '0x1', name: 'x' },
        empty: null,
        ok: trader({ name: 'jax' }),
      }),
    ).toEqual({
      traders: [trader({ name: 'jax' })],
      anonymous: 0,
    })
  })

  test('treats a missing tree as empty', () => {
    expect(parseTraders(null)).toEqual({ traders: [], anonymous: 0 })
    expect(parseTraders(undefined)).toEqual({ traders: [], anonymous: 0 })
  })

  test('keeps a live heart rate on the trader row', () => {
    expect(
      parseTraders({
        ok: trader({ heartRate: 84, heartRateAt: 1_000_000 }),
      }).traders[0],
    ).toEqual(trader({ heartRate: 84, heartRateAt: 1_000_000 }))
  })

  test('drops an out-of-range heart rate', () => {
    expect(parseTraders({ ok: trader({ heartRate: 900 }) }).traders[0]?.heartRate).toBeUndefined()
  })

  test('counts live anonymous sessions instead of a single counter', () => {
    const now = 1_000_000
    expect(
      parseTraders(
        {
          anonymous: {
            tabA: now - 1_000,
            tabB: now - 2_000,
            stale: now - 120_000,
          },
        },
        now,
      ).anonymous,
    ).toBe(2)
  })
})

describe('parseHeartRateBpm', () => {
  test('accepts a rounded bpm in a wearable range', () => {
    expect(parseHeartRateBpm(72.4)).toBe(72)
    expect(parseHeartRateBpm(0)).toBeUndefined()
    expect(parseHeartRateBpm(null)).toBeUndefined()
  })
})

describe('traderHeartRateUpdate', () => {
  test('writes bpm and timestamp, or clears both fields', () => {
    expect(traderHeartRateUpdate(88, 1_000_000)).toEqual({ heartRate: 88, heartRateAt: 1_000_000 })
    expect(traderHeartRateUpdate(null)).toEqual({ heartRate: null, heartRateAt: null })
  })
})

describe('liveTraderHeartRate', () => {
  const now = 1_000_000

  test('returns a live bpm and drops a stale reading', () => {
    expect(liveTraderHeartRate({ heartRate: 84, heartRateAt: now - 1_000 }, now)).toBe(84)
    expect(liveTraderHeartRate({ heartRate: 84, heartRateAt: now - 120_000 }, now)).toBeUndefined()
    expect(liveTraderHeartRate({ heartRate: 72 }, now)).toBe(72)
    expect(liveTraderHeartRate({}, now)).toBeUndefined()
  })
})

describe('isTraderOnline', () => {
  const now = 1_000_000

  test('keeps a tab online when status was flipped offline but a session is still live', () => {
    expect(
      isTraderOnline(
        trader({
          status: 'offline',
          lastSeen: now - 5_000,
          sessions: { tabA: now - 5_000 },
        }),
        now,
      ),
    ).toBe(true)
  })

  test('stays online when one of two tab sessions drops', () => {
    expect(
      isTraderOnline(
        trader({
          status: 'online',
          lastSeen: now - 2_000,
          sessions: { tabA: now - 40_000, tabB: now - 2_000 },
        }),
        now,
      ),
    ).toBe(true)
  })

  test('treats a reconnect window as online via lastSeen even if sessions were cleared', () => {
    expect(
      isTraderOnline(
        trader({
          status: 'offline',
          lastSeen: now - 8_000,
          sessions: {},
        }),
        now,
      ),
    ).toBe(true)
  })

  test('expires a trader whose lastSeen and sessions are stale', () => {
    expect(
      isTraderOnline(
        trader({
          status: 'online',
          lastSeen: now - 120_000,
          sessions: { tabA: now - 120_000 },
        }),
        now,
      ),
    ).toBe(false)
  })
})

describe('onlineTraderCount', () => {
  const now = 1_000_000

  test('sums live presence with the anonymous counter', () => {
    expect(
      onlineTraderCount(
        {
          traders: [
            trader({ lastSeen: now - 1_000, sessions: { a: now - 1_000 } }),
            trader({ address: '0x2', name: 'kira', status: 'offline' }),
            trader({ address: '0x3', name: 'jax', status: 'online', lastSeen: now - 1_000 }),
          ],
          anonymous: 5,
        },
        now,
      ),
    ).toBe(7)
  })

  test('does not drop a signed-in tab that still has a live session', () => {
    expect(
      onlineTraderCount(
        {
          traders: [
            trader({
              status: 'offline',
              lastSeen: now - 3_000,
              sessions: { tab1: now - 3_000 },
            }),
            trader({
              address: '0x2',
              name: 'kira',
              status: 'online',
              lastSeen: now - 3_000,
              sessions: { tab2: now - 3_000 },
            }),
          ],
          anonymous: 0,
        },
        now,
      ),
    ).toBe(2)
  })
})

describe('formatTraderCount', () => {
  test('uses a singular label for one trader', () => {
    expect(formatTraderCount(0)).toBe('0 traders')
    expect(formatTraderCount(1)).toBe('1 trader')
    expect(formatTraderCount(12)).toBe('12 traders')
  })
})

describe('traderIdentity', () => {
  test('prefers a social name and falls back to the wallet', () => {
    expect(
      traderIdentity({
        id: 'did:privy:1',
        wallet: { address: '0x1111111111111111111111111111111111111111' },
        google: { name: 'Nova' },
      }),
    ).toEqual({
      address: '0x1111111111111111111111111111111111111111',
      name: 'Nova',
    })

    expect(
      traderIdentity({
        id: 'did:privy:2',
        wallet: { address: '0x2222222222222222222222222222222222222222' },
      }),
    ).toEqual({
      address: '0x2222222222222222222222222222222222222222',
      name: '0x2222...2222',
    })

    expect(traderIdentity({}, 'you')).toEqual({ address: '', name: 'you' })
  })
})
