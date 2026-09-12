'use client'

import {
  HEART_RATE_MEASUREMENT_UUID,
  HEART_RATE_SERVICE_UUID,
  HeartRateError,
  clearRememberedHeartRateDevice,
  findRememberedBluetoothDevice,
  heartRateErrorFromUnknown,
  isHeartRateSupported,
  parseHeartRateMeasurement,
  readRememberedHeartRateDevice,
  rememberedHeartRateDeviceName,
  writeRememberedHeartRateDevice,
  type HeartRateContact,
  type HeartRateRememberedDevice,
} from '@/lib/heart-rate'
import { useCallback, useEffect, useRef, useState } from 'react'

export type HeartRateStatus = 'unsupported' | 'idle' | 'requesting' | 'connecting' | 'live' | 'error'

export type HeartRateConnectOptions = {
  prompt?: boolean
  silent?: boolean
}

export type HeartRateState = {
  status: HeartRateStatus
  bpm: number | null
  deviceName: string | null
  contact: HeartRateContact | null
  error: string | null
  remembered: HeartRateRememberedDevice | null
}

type HeartRateSession = {
  device: BluetoothDevice
  characteristic: BluetoothRemoteGATTCharacteristic
  onValue: EventListener
  onDisconnected: EventListener
}

const idleState: HeartRateState = {
  status: 'idle',
  bpm: null,
  deviceName: null,
  contact: null,
  error: null,
  remembered: null,
}

function unsupportedState(remembered: HeartRateRememberedDevice | null = null): HeartRateState {
  return {
    ...idleState,
    status: 'unsupported',
    error: 'Heart rate needs Chrome or Edge.',
    remembered,
  }
}

function idleWith(remembered: HeartRateRememberedDevice | null): HeartRateState {
  return {
    ...idleState,
    remembered,
    deviceName: remembered ? rememberedHeartRateDeviceName(remembered) : null,
  }
}

async function permittedHeartRateDevice(bluetooth: Bluetooth, remembered: HeartRateRememberedDevice | null) {
  if (!remembered || typeof bluetooth.getDevices !== 'function') return undefined
  const devices = await bluetooth.getDevices()
  return findRememberedBluetoothDevice(devices, remembered)
}

export function useHeartRate() {
  const [state, setState] = useState<HeartRateState>(idleState)
  const sessionRef = useRef<HeartRateSession | null>(null)
  const generationRef = useRef(0)
  const connectingRef = useRef(false)
  const rememberedRef = useRef<HeartRateRememberedDevice | null>(null)
  const didAutoConnect = useRef(false)

  const teardown = useCallback(async () => {
    const session = sessionRef.current
    sessionRef.current = null
    if (!session) return

    session.device.removeEventListener('gattserverdisconnected', session.onDisconnected)
    session.characteristic.removeEventListener('characteristicvaluechanged', session.onValue)

    try {
      await session.characteristic.stopNotifications()
    } catch {
      // Device may already be gone.
    }

    try {
      session.device.gatt?.disconnect()
    } catch {
      // Disconnect is best-effort.
    }
  }, [])

  const remember = useCallback((device: HeartRateRememberedDevice | null) => {
    rememberedRef.current = device
    if (device) writeRememberedHeartRateDevice(device)
    else clearRememberedHeartRateDevice()
  }, [])

  const connect = useCallback(
    async (options: HeartRateConnectOptions = {}) => {
      if (connectingRef.current) return
      if (!isHeartRateSupported()) {
        setState(unsupportedState(rememberedRef.current))
        return
      }

      connectingRef.current = true
      const generation = generationRef.current + 1
      generationRef.current = generation
      await teardown()

      const prompt = options.prompt === true
      const silent = options.silent === true
      const remembered = rememberedRef.current ?? readRememberedHeartRateDevice()
      if (remembered) rememberedRef.current = remembered

      setState({
        ...idleWith(remembered),
        status: prompt || !remembered ? 'requesting' : 'connecting',
      })

      try {
        const bluetooth = navigator.bluetooth
        if (!bluetooth) {
          throw new HeartRateError('unsupported', 'Heart rate needs Chrome or Edge.')
        }

        let device: BluetoothDevice | undefined
        if (!prompt) {
          device = await permittedHeartRateDevice(bluetooth, remembered)
        }

        if (!device && silent) {
          setState(idleWith(remembered))
          return
        }

        if (!device) {
          setState({
            ...idleWith(remembered),
            status: 'requesting',
          })
          device = await bluetooth.requestDevice({
            filters: [{ services: [HEART_RATE_SERVICE_UUID] }],
          })
        }

        if (generationRef.current !== generation) return

        const nextRemembered: HeartRateRememberedDevice = {
          id: device.id,
          name: device.name || remembered?.name || null,
        }
        remember(nextRemembered)

        setState({
          ...idleWith(nextRemembered),
          status: 'connecting',
          deviceName: rememberedHeartRateDeviceName(nextRemembered),
        })

        const server = await device.gatt?.connect()
        if (!server) {
          throw new HeartRateError('missing-characteristic', 'This device cannot open a Bluetooth connection.')
        }

        let characteristic: BluetoothRemoteGATTCharacteristic
        try {
          const service = await server.getPrimaryService(HEART_RATE_SERVICE_UUID)
          characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT_UUID)
        } catch {
          throw new HeartRateError('missing-characteristic', 'This device does not expose heart rate.')
        }

        if (generationRef.current !== generation) {
          try {
            server.disconnect()
          } catch {
            // Session was cancelled.
          }
          return
        }

        const onValue: EventListener = (event) => {
          if (generationRef.current !== generation) return
          const value = (event.target as BluetoothRemoteGATTCharacteristic | null)?.value
          if (!value) return

          try {
            const measurement = parseHeartRateMeasurement(value)
            setState({
              status: 'live',
              bpm: measurement.bpm,
              deviceName: rememberedHeartRateDeviceName(nextRemembered),
              contact: measurement.contact,
              error: null,
              remembered: nextRemembered,
            })
          } catch (error) {
            const hrError = heartRateErrorFromUnknown(error)
            setState((current) => ({
              ...current,
              status: 'error',
              error: hrError.message,
            }))
          }
        }

        const onDisconnected: EventListener = () => {
          if (generationRef.current !== generation) return
          sessionRef.current = null
          setState((current) => ({
            status: 'error',
            bpm: current.bpm,
            deviceName: current.deviceName,
            contact: current.contact,
            error: 'Wearable disconnected.',
            remembered: nextRemembered,
          }))
        }

        device.addEventListener('gattserverdisconnected', onDisconnected)
        characteristic.addEventListener('characteristicvaluechanged', onValue)
        await characteristic.startNotifications()

        if (generationRef.current !== generation) {
          device.removeEventListener('gattserverdisconnected', onDisconnected)
          characteristic.removeEventListener('characteristicvaluechanged', onValue)
          try {
            server.disconnect()
          } catch {
            // Session was cancelled.
          }
          return
        }

        sessionRef.current = { device, characteristic, onValue, onDisconnected }
        setState({
          status: 'live',
          bpm: null,
          deviceName: rememberedHeartRateDeviceName(nextRemembered),
          contact: null,
          error: null,
          remembered: nextRemembered,
        })
      } catch (error) {
        if (generationRef.current !== generation) return

        const hrError = heartRateErrorFromUnknown(error)
        if (hrError.code === 'cancelled' || silent) {
          setState(idleWith(rememberedRef.current))
          return
        }

        setState({
          status: hrError.code === 'unsupported' ? 'unsupported' : 'error',
          bpm: null,
          deviceName: rememberedRef.current ? rememberedHeartRateDeviceName(rememberedRef.current) : null,
          contact: null,
          error: hrError.message,
          remembered: rememberedRef.current,
        })
      } finally {
        if (generationRef.current === generation) connectingRef.current = false
      }
    },
    [remember, teardown],
  )

  const disconnect = useCallback(async () => {
    generationRef.current += 1
    connectingRef.current = false
    await teardown()
    setState(isHeartRateSupported() ? idleWith(rememberedRef.current) : unsupportedState(rememberedRef.current))
  }, [teardown])

  const forget = useCallback(async () => {
    remember(null)
    await disconnect()
  }, [disconnect, remember])

  useEffect(() => {
    if (!isHeartRateSupported()) {
      setState(unsupportedState())
      return
    }

    const remembered = readRememberedHeartRateDevice()
    rememberedRef.current = remembered
    setState(idleWith(remembered))

    if (remembered && !didAutoConnect.current) {
      didAutoConnect.current = true
      void connect({ silent: true })
    }

    return () => {
      generationRef.current += 1
      void teardown()
    }
  }, [connect, teardown])

  return {
    ...state,
    connect,
    disconnect,
    forget,
    busy: state.status === 'requesting' || state.status === 'connecting',
    live: state.status === 'live',
  }
}
