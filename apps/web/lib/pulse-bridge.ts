import type { HeartRateContact } from '@/lib/heart-rate'

/** How often the browser asks the CELL-4B bridge for its latest reading; the Pi analyses a new window every 2 s. */
export const PULSE_BRIDGE_POLL_MS = 1_000
/** A reading whose timestamp has not moved for this long counts as no reading: the sensor or the Pi has stopped. */
export const PULSE_BRIDGE_STALE_MS = 10_000
/** Failed polls in a row before a live bridge counts as lost. */
export const PULSE_BRIDGE_MAX_FAILURES = 3
export const PULSE_BRIDGE_REQUEST_TIMEOUT_MS = 4_000
export const PULSE_BRIDGE_DEVICE_NAME = 'CELL-4B pulse (Wi-Fi)'
export const PULSE_BRIDGE_STORAGE_KEY = 'rogs.pulseBridge'

// report_heart accepts 30-230 bpm (HEART_BPM_MIN / HEART_BPM_MAX in the program).
const BPM_MIN = 30
const BPM_MAX = 230

export type PulseBridgeReading = { bpm: number | null; contact: HeartRateContact; at: number | null }
export type PulseBridgeTracker = { at: number | null; changedAt: number }

/**
 * One `GET /pulse` body from tools/cell4b-heart-bridge. A bpm is kept only when the bridge reports a present pulse
 * (its own confidence, range and perfusion checks passed) with a timestamp and a whole bpm the program accepts.
 */
export function parsePulseBridgeReading(value: unknown): PulseBridgeReading {
  const record = value && typeof value === 'object' ? (value as { bpm?: unknown; present?: unknown; at?: unknown }) : {}
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : null
  const bpm =
    typeof record.bpm === 'number' && Number.isInteger(record.bpm) && record.bpm >= BPM_MIN && record.bpm <= BPM_MAX
      ? record.bpm
      : null
  if (record.present !== true || at === null || bpm === null) return { bpm: null, contact: 'not-detected', at }
  return { bpm, contact: 'detected', at }
}

/**
 * Freshness on the browser's clock: a reading goes stale when its timestamp has not changed for PULSE_BRIDGE_STALE_MS,
 * so a Pi clock that is ahead or behind this machine does not matter.
 */
export function trackPulseBridgeReading(reading: PulseBridgeReading, tracker: PulseBridgeTracker | null, now: number) {
  const next: PulseBridgeTracker = !tracker || reading.at !== tracker.at ? { at: reading.at, changedAt: now } : tracker
  const stale = now - next.changedAt > PULSE_BRIDGE_STALE_MS
  return {
    bpm: stale ? null : reading.bpm,
    contact: stale ? ('not-detected' as const) : reading.contact,
    tracker: next,
  }
}
