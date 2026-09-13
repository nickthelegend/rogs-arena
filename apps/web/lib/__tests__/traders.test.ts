import { describe, expect, test } from 'bun:test'
import {
  formatTraderCount,
  isTraderOnline,
  liveTraderHeartRate,
  onlineTraderCount,
  parseHeartRateBpm,
  parseTraders,
  traderHeartRateUpdate,
  traderFromDto,
  traderIdentity,
  traderKey,
  type Trader,
} from '../traders'

function trader(overrides: Partial<Trader> = {}): Trader {
  return {
    address: 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr',
    name: 'nova',
    status: 'online',
    ...overrides,
  }
}

describe('traderKey', () => {
  test('keeps base58 case and strips firebase-forbidden characters', () => {
    expect(traderKey('Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr')).toBe('Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr')
    expect(traderKey('AbC.def#1$[x]/Y')).toBe('AbC_def_1__x__Y')
  })
})

describe('traderFromDto', () => {
  const dto = {
    address: 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr',
    name: 'nova',
    status: 'online' as const,
    lastSeen: 1_000_500,
    heartRate: 84,
    heartRateAt: 1_000_400,
    isBot: false,
  }

  test('shifts server timestamps onto the local clock', () => {
    expect(traderFromDto(dto, 500)).toEqual({
      address: dto.address,
      name: 'nova',
      status: 'online',
      lastSeen: 1_000_000,
      heartRate: 84,
      heartRateAt: 999_900,
    })
  })

  test('omits a cleared heart rate and falls back to the short address for a missing name', () => {
    expect(traderFromDto({ ...dto, name: '', heartRate: null, heartRateAt: null })).toEqual({
      address: dto.address,
      name: 'Ens1…yVvr',
      status: 'online',
      lastSeen: 1_000_500,
    })
  })
})

describe('parseTraders', () => {
  test('reads roster entries and the anonymous counter', () => {
    const snapshot = parseTraders({
      'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr': trader(),
      '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr': trader({
        address: '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
        name: 'kira',
        status: 'offline',
      }),
      anonymous: 4,
    })

    expect(snapshot.anonymous).toBe(4)
    expect(snapshot.traders).toEqual([
      trader({
        address: '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
        name: 'kira',
        status: 'offline',
      }),
      trader(),
    ])
  })

  test('drops invalid rows and clamps a negative anonymous count', () => {
    expect(
      parseTraders({
        anonymous: -3.8,
        bad: { address: 'J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q', name: 'x' },
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
            trader({ address: 'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu', name: 'kira', status: 'offline' }),
            trader({ address: 'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57', name: 'jax', status: 'online', lastSeen: now - 1_000 }),
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
              address: 'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu',
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
        id: 'guest-1',
        wallet: { address: 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr' },
        google: { name: 'Nova' },
      }),
    ).toEqual({
      address: 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr',
      name: 'Nova',
    })

    expect(
      traderIdentity({
        id: 'guest-2',
        wallet: { address: '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr' },
      }),
    ).toEqual({
      address: '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
      name: '71wt…51sr',
    })

    expect(traderIdentity({}, 'you')).toEqual({ address: '', name: 'you' })
  })
})
