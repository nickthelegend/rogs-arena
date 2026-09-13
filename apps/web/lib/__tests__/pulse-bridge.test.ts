import { describe, expect, test } from 'bun:test'
import { PULSE_BRIDGE_STALE_MS, parsePulseBridgeReading, trackPulseBridgeReading } from '../pulse-bridge'

describe('CELL-4B pulse bridge readings', () => {
  test('a present pulse with a timestamp gives its bpm with contact detected', () => {
    expect(
      parsePulseBridgeReading({ bpm: 72, present: true, confidence: 0.82, perfusion: 1.9, reason: '', at: 1_789_000_000_000 }),
    ).toEqual({ bpm: 72, contact: 'detected', at: 1_789_000_000_000 })
  })

  test('no pulse, a value the program rejects, or a malformed body gives no bpm', () => {
    expect(parsePulseBridgeReading({ bpm: null, present: false, reason: 'confidence 0.27', at: 5 })).toEqual({
      bpm: null,
      contact: 'not-detected',
      at: 5,
    })
    expect(parsePulseBridgeReading({ bpm: 72, present: false, at: 5 }).bpm).toBeNull()
    expect(parsePulseBridgeReading({ bpm: 250, present: true, at: 5 }).bpm).toBeNull()
    expect(parsePulseBridgeReading({ bpm: 29, present: true, at: 5 }).bpm).toBeNull()
    expect(parsePulseBridgeReading({ bpm: 72.5, present: true, at: 5 }).bpm).toBeNull()
    expect(parsePulseBridgeReading({ bpm: 72, present: true }).bpm).toBeNull()
    expect(parsePulseBridgeReading(null)).toEqual({ bpm: null, contact: 'not-detected', at: null })
    expect(parsePulseBridgeReading('72')).toEqual({ bpm: null, contact: 'not-detected', at: null })
  })

  test('a reading whose timestamp stops moving goes stale on the browser clock, whatever the Pi clock says', () => {
    const reading = parsePulseBridgeReading({ bpm: 68, present: true, at: 42 })
    const first = trackPulseBridgeReading(reading, null, 1_000)
    expect(first.bpm).toBe(68)
    const still = trackPulseBridgeReading(reading, first.tracker, 1_000 + PULSE_BRIDGE_STALE_MS)
    expect(still.bpm).toBe(68)
    const stale = trackPulseBridgeReading(reading, still.tracker, 1_001 + PULSE_BRIDGE_STALE_MS)
    expect(stale).toEqual({ bpm: null, contact: 'not-detected', tracker: { at: 42, changedAt: 1_000 } })
    const moved = trackPulseBridgeReading(parsePulseBridgeReading({ bpm: 70, present: true, at: 44 }), stale.tracker, 20_000)
    expect(moved).toEqual({ bpm: 70, contact: 'detected', tracker: { at: 44, changedAt: 20_000 } })
  })
})
