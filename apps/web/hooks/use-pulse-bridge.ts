'use client'

import { env } from '@/env'
import type { HeartRateHook, HeartRateState } from '@/hooks/use-heart-rate'
import { useHydrated } from '@/hooks/use-hydrated'
import { errorMessage } from '@/lib/error'
import {
  PULSE_BRIDGE_DEVICE_NAME,
  PULSE_BRIDGE_MAX_FAILURES,
  PULSE_BRIDGE_POLL_MS,
  PULSE_BRIDGE_REQUEST_TIMEOUT_MS,
  PULSE_BRIDGE_STORAGE_KEY,
  parsePulseBridgeReading,
  trackPulseBridgeReading,
  type PulseBridgeTracker,
} from '@/lib/pulse-bridge'
import { useCallback, useEffect, useRef, useState } from 'react'

const idleState: HeartRateState = { status: 'idle', bpm: null, deviceName: null, contact: null, error: null, remembered: null }

function readSaved() {
  try {
    return window.localStorage.getItem(PULSE_BRIDGE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeSaved(saved: boolean) {
  try {
    if (saved) window.localStorage.setItem(PULSE_BRIDGE_STORAGE_KEY, '1')
    else window.localStorage.removeItem(PULSE_BRIDGE_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private mode.
  }
}

/**
 * Heart rate from the CELL-4B pulse bridge on the LAN (tools/cell4b-heart-bridge), used when
 * NEXT_PUBLIC_PULSE_BRIDGE_URL is set because that Pi cannot advertise over Bluetooth. It has the Bluetooth hook's
 * shape, so the island, the WS heart frames and report_heart are unchanged. It polls GET /pulse and shows a bpm only
 * while the bridge reports a present, fresh pulse.
 */
export function usePulseBridgeHeartRate(): HeartRateHook {
  const url = env.NEXT_PUBLIC_PULSE_BRIDGE_URL?.replace(/\/$/, '') ?? null
  const [state, setState] = useState<HeartRateState>(idleState)
  const generationRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const trackerRef = useRef<PulseBridgeTracker | null>(null)

  const stop = useCallback(() => {
    generationRef.current += 1
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    trackerRef.current = null
  }, [])

  const connect = useCallback(
    // The bridge has no device picker, so the Bluetooth connect options do not apply.
    async () => {
      if (!url) return
      stop()
      const generation = generationRef.current
      let failures = 0
      let live = false
      setState({ ...idleState, status: 'connecting', deviceName: PULSE_BRIDGE_DEVICE_NAME })

      const poll = async () => {
        try {
          const response = await fetch(`${url}/pulse`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(PULSE_BRIDGE_REQUEST_TIMEOUT_MS),
          })
          if (!response.ok) throw new Error(`the bridge answered HTTP ${response.status}`)
          const reading = parsePulseBridgeReading(await response.json())
          if (generationRef.current !== generation) return
          const tracked = trackPulseBridgeReading(reading, trackerRef.current, Date.now())
          trackerRef.current = tracked.tracker
          failures = 0
          if (!live) {
            live = true
            writeSaved(true)
          }
          setState({
            status: 'live',
            bpm: tracked.bpm,
            deviceName: PULSE_BRIDGE_DEVICE_NAME,
            contact: tracked.contact,
            error: null,
            remembered: null,
          })
        } catch (error) {
          if (generationRef.current !== generation) return
          failures += 1
          if (!live || failures >= PULSE_BRIDGE_MAX_FAILURES) {
            setState({
              ...idleState,
              status: 'error',
              deviceName: PULSE_BRIDGE_DEVICE_NAME,
              error: live
                ? `Lost the CELL-4B pulse bridge: ${errorMessage(error)}`
                : `Could not reach the CELL-4B pulse bridge at ${url}: ${errorMessage(error)}`,
            })
            return
          }
        }
        if (generationRef.current === generation) timerRef.current = window.setTimeout(() => void poll(), PULSE_BRIDGE_POLL_MS)
      }

      await poll()
    },
    [stop, url],
  )

  const disconnect = useCallback(async () => {
    stop()
    setState(idleState)
  }, [stop])

  const forget = useCallback(async () => {
    writeSaved(false)
    await disconnect()
  }, [disconnect])

  // A bridge that was connected before a reload reconnects once the page has hydrated (storage is client-only).
  const hydrated = useHydrated()
  const didAutoConnect = useRef(false)
  useEffect(() => {
    if (!hydrated || didAutoConnect.current || !readSaved()) return
    didAutoConnect.current = true
    void connect()
  }, [connect, hydrated])

  useEffect(() => stop, [stop])

  return {
    ...state,
    connect,
    disconnect,
    forget,
    busy: state.status === 'connecting',
    live: state.status === 'live',
    sourceLabel: 'CELL-4B pulse sensor over Wi-Fi',
    canPair: false,
  }
}
