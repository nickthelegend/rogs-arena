import { describe, expect, test } from 'bun:test'
import {
  HEART_RATE_REQUEST_OPTIONS,
  HEART_RATE_SERVICE_UUID,
  HeartRateError,
  clearRememberedHeartRateDevice,
  findRememberedBluetoothDevice,
  heartRateErrorFromUnknown,
  isHeartRateSupported,
  parseHeartRateMeasurement,
  parseRememberedHeartRateDevice,
  readRememberedHeartRateDevice,
  writeRememberedHeartRateDevice,
} from '../heart-rate'

function packet(...bytes: number[]) {
  return new DataView(new Uint8Array(bytes).buffer)
}

describe('isHeartRateSupported', () => {
  test('requires a secure context and Web Bluetooth', () => {
    expect(isHeartRateSupported({ bluetooth: {}, isSecureContext: true })).toBe(true)
    expect(isHeartRateSupported({ bluetooth: {}, isSecureContext: false })).toBe(false)
    expect(isHeartRateSupported({ isSecureContext: true })).toBe(false)
    expect(isHeartRateSupported({})).toBe(false)
  })
})

describe('HEART_RATE_REQUEST_OPTIONS', () => {
  test('filters the picker to heart-rate monitors', () => {
    expect(HEART_RATE_REQUEST_OPTIONS).toEqual({
      filters: [{ services: [HEART_RATE_SERVICE_UUID] }],
    })
  })
})

describe('parseHeartRateMeasurement', () => {
  test('reads an 8-bit BPM value', () => {
    expect(parseHeartRateMeasurement(packet(0x00, 72))).toEqual({ bpm: 72, contact: 'unsupported' })
  })

  test('reads a little-endian 16-bit BPM value', () => {
    expect(parseHeartRateMeasurement(packet(0x01, 0x2c, 0x01))).toEqual({ bpm: 300, contact: 'unsupported' })
  })

  test('reads sensor contact flags', () => {
    expect(parseHeartRateMeasurement(packet(0x06, 80))).toEqual({ bpm: 80, contact: 'detected' })
    expect(parseHeartRateMeasurement(packet(0x02, 64))).toEqual({ bpm: 64, contact: 'not-detected' })
  })

  test('rejects packets that are too short', () => {
    expect(() => parseHeartRateMeasurement(packet(0x00))).toThrow(HeartRateError)
    expect(() => parseHeartRateMeasurement(packet(0x01, 0x2c))).toThrow(HeartRateError)
  })
})

describe('heartRateErrorFromUnknown', () => {
  test('maps chooser cancel and missing GATT to typed codes', () => {
    const cancelled = heartRateErrorFromUnknown(new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError'))
    expect(cancelled.code).toBe('cancelled')

    const unsupported = heartRateErrorFromUnknown(new DOMException('Bluetooth is not supported.', 'NotSupportedError'))
    expect(unsupported.code).toBe('unsupported')

    const disconnected = heartRateErrorFromUnknown(new DOMException('GATT Server is disconnected.', 'NetworkError'))
    expect(disconnected.code).toBe('disconnected')

    const existing = new HeartRateError('missing-characteristic', 'This device does not expose heart rate.')
    expect(heartRateErrorFromUnknown(existing)).toBe(existing)
  })
})

describe('remembered heart-rate device', () => {
  test('parses a stored id and name', () => {
    expect(parseRememberedHeartRateDevice({ id: 'id-1', name: 'Mi Band 10' })).toEqual({
      id: 'id-1',
      name: 'Mi Band 10',
    })
    expect(parseRememberedHeartRateDevice({ id: 'id-1', name: '' })).toEqual({ id: 'id-1', name: null })
    expect(parseRememberedHeartRateDevice({ name: 'Mi Band 10' })).toBeNull()
  })

  test('reads and writes through storage', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    }

    expect(readRememberedHeartRateDevice(storage)).toBeNull()
    writeRememberedHeartRateDevice({ id: 'id-1', name: 'Mi Band 10' }, storage)
    expect(readRememberedHeartRateDevice(storage)).toEqual({ id: 'id-1', name: 'Mi Band 10' })
    clearRememberedHeartRateDevice(storage)
    expect(readRememberedHeartRateDevice(storage)).toBeNull()
  })

  test('finds the remembered device in Chrome’s permitted list', () => {
    const remembered = { id: 'id-2', name: 'Polar' }
    expect(
      findRememberedBluetoothDevice([{ id: 'id-1' }, { id: 'id-2' }, { id: 'id-3' }], remembered)?.id,
    ).toBe('id-2')
    expect(findRememberedBluetoothDevice([{ id: 'id-1' }], remembered)).toBeUndefined()
  })
})
