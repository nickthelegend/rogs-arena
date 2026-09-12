import { describe, expect, test } from 'bun:test'
import { Keypair } from '@solana/web3.js'
import { HEART_TTL_MS, OFFLINE_RETENTION_MS, Presence, PRESENCE_TTL_MS, shortAddress } from '../presence'

const newWallet = () => Keypair.generate().publicKey.toBase58()

describe('presence with an injected clock', () => {
  test('a session is online while presence arrives within 45 s', () => {
    let now = 1_000_000
    const presence = new Presence(() => now)
    const alice = newWallet()

    expect(presence.join('tab-alice', 'conn-1', alice)).toBe(true)
    expect(presence.join('tab-anon', 'conn-2', null)).toBe(true)
    expect(presence.list()).toEqual({
      traders: [
        { address: alice, name: shortAddress(alice), status: 'online', lastSeen: 1_000_000, heartRate: null, heartRateAt: null, isBot: false },
      ],
      anonymous: 1,
      online: 2,
    })

    now = 1_030_000
    // A routine refresh changes nothing visible, so it must not trigger a broadcast.
    expect(presence.join('tab-alice', 'conn-1', alice)).toBe(false)

    now = 1_000_000 + PRESENCE_TTL_MS
    expect(presence.list().anonymous).toBe(1)
    now += 1
    expect(presence.sweep()).toBe(true)
    expect(presence.list()).toMatchObject({ anonymous: 0, online: 1 })
    expect(presence.list().traders[0]?.status).toBe('online')

    now = 1_030_000 + PRESENCE_TTL_MS + 1
    expect(presence.sweep()).toBe(true)
    expect(presence.list()).toEqual({
      traders: [
        { address: alice, name: shortAddress(alice), status: 'offline', lastSeen: 1_030_000, heartRate: null, heartRateAt: null, isBot: false },
      ],
      anonymous: 0,
      online: 0,
    })

    now = 1_030_000 + OFFLINE_RETENTION_MS + 1
    presence.sweep()
    expect(presence.list().traders).toEqual([])
  })

  test('heart rate is shown only while fresh', () => {
    let now = 5_000_000
    const presence = new Presence(() => now)
    const bob = newWallet()
    presence.join('tab-bob', 'conn-1', bob)
    expect(presence.setHeart(bob, 88)).toBe(true)
    expect(presence.list().traders[0]).toMatchObject({ heartRate: 88, heartRateAt: 5_000_000 })

    now += 40_000
    presence.join('tab-bob', 'conn-1', bob)
    now = 5_000_000 + HEART_TTL_MS
    expect(presence.list().traders[0]).toMatchObject({ status: 'online', heartRate: 88 })
    now += 1
    expect(presence.list().traders[0]).toMatchObject({ status: 'online', heartRate: null, heartRateAt: null })
    // Expiry is visible without a mutation, and the next sweep must still report it for a broadcast.
    expect(presence.sweep()).toBe(true)
    expect(presence.sweep()).toBe(false)

    expect(presence.setHeart(bob, 101)).toBe(true)
    expect(presence.setHeart(bob, null)).toBe(true)
    expect(presence.list().traders[0]).toMatchObject({ heartRate: null, heartRateAt: null })
  })

  test('on-chain heart confirmations never override a newer live value', () => {
    let now = 9_000_000
    const presence = new Presence(() => now)
    const carol = newWallet()
    expect(presence.confirmHeart(carol, 70, now)).toBe(false)
    presence.join('tab-carol', 'conn-1', carol)
    presence.setHeart(carol, 95)
    expect(presence.confirmHeart(carol, 70, now - 1_000)).toBe(false)
    now += 2_000
    expect(presence.confirmHeart(carol, 72, now)).toBe(true)
    expect(presence.list().traders[0]).toMatchObject({ heartRate: 72, heartRateAt: 9_002_000 })
  })

  test('leave only removes the owning connection, and profiles set names and bot flags', () => {
    const now = 2_000_000
    const presence = new Presence(() => now)
    const dave = newWallet()
    presence.join('tab-dave', 'conn-old', dave)
    presence.join('tab-dave', 'conn-new', dave)
    expect(presence.leave('tab-dave', 'conn-old')).toBe(false)
    expect(presence.list().traders[0]?.status).toBe('online')
    expect(presence.setProfile(dave, 'Dave', true)).toBe(true)
    expect(presence.list().traders[0]).toMatchObject({ name: 'Dave', isBot: true })
    expect(presence.leave('tab-dave', 'conn-new')).toBe(true)
    expect(presence.list()).toMatchObject({ online: 0, traders: [{ status: 'offline' }] })
  })
})
