export const HEART_RATE_SERVICE_UUID = 'heart_rate'
export const HEART_RATE_MEASUREMENT_UUID = 'heart_rate_measurement'
export const HEART_RATE_DEVICE_STORAGE_KEY = 'rizz.heartRateDevice'

export const HEART_RATE_REQUEST_OPTIONS = {
  filters: [{ services: [HEART_RATE_SERVICE_UUID] }],
} as const

export type HeartRateContact = 'detected' | 'not-detected' | 'unsupported'

export type HeartRateMeasurement = {
  bpm: number
  contact: HeartRateContact
}

export type HeartRateRememberedDevice = {
  id: string
  name: string | null
}

export type HeartRateStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type HeartRateErrorCode =
  | 'unsupported'
  | 'cancelled'
  | 'disconnected'
  | 'missing-characteristic'
  | 'unknown'

export type HeartRateSupportEnv = {
  bluetooth?: unknown
  isSecureContext?: boolean
}

export class HeartRateError extends Error {
  readonly code: HeartRateErrorCode

  constructor(code: HeartRateErrorCode, message: string) {
    super(message)
    this.name = 'HeartRateError'
    this.code = code
  }
}

export function heartRateSupportEnv(): HeartRateSupportEnv {
  const navigatorBluetooth =
    typeof navigator !== 'undefined' ? (navigator as Navigator & { bluetooth?: unknown }).bluetooth : undefined

  return {
    bluetooth: navigatorBluetooth,
    isSecureContext: typeof globalThis !== 'undefined' ? Boolean(globalThis.isSecureContext) : false,
  }
}

export function isHeartRateSupported(env: HeartRateSupportEnv = heartRateSupportEnv()) {
  return Boolean(env.isSecureContext && env.bluetooth)
}

export function parseHeartRateMeasurement(data: DataView): HeartRateMeasurement {
  if (data.byteLength < 2) {
    throw new HeartRateError('unknown', 'Heart rate packet is too short.')
  }

  const flags = data.getUint8(0)
  const isUint16 = (flags & 0x01) !== 0
  const contactSupported = (flags & 0x02) !== 0
  const contactDetected = (flags & 0x04) !== 0

  if (isUint16 && data.byteLength < 3) {
    throw new HeartRateError('unknown', 'Heart rate packet is too short.')
  }

  const bpm = isUint16 ? data.getUint16(1, true) : data.getUint8(1)
  const contact: HeartRateContact = contactSupported ? (contactDetected ? 'detected' : 'not-detected') : 'unsupported'

  return { bpm, contact }
}

export function heartRateErrorFromUnknown(error: unknown): HeartRateError {
  if (error instanceof HeartRateError) return error

  const name = error instanceof DOMException ? error.name : ''
  const message = error instanceof Error && error.message ? error.message : ''

  if (name === 'NotFoundError' || /cancell?ed|chooser/i.test(message)) {
    return new HeartRateError('cancelled', 'Device picker was closed.')
  }

  if (name === 'SecurityError' || name === 'NotSupportedError' || /not supported|secure context/i.test(message)) {
    return new HeartRateError('unsupported', 'Heart rate needs Chrome or Edge on HTTPS.')
  }

  if (name === 'NetworkError' || /disconnect/i.test(message)) {
    return new HeartRateError('disconnected', 'Wearable disconnected.')
  }

  return new HeartRateError('unknown', message || 'Could not connect to wearable.')
}

export function parseRememberedHeartRateDevice(value: unknown): HeartRateRememberedDevice | null {
  if (!value || typeof value !== 'object') return null

  const record = value as { id?: unknown; name?: unknown }
  if (typeof record.id !== 'string' || record.id.length === 0) return null

  const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : null
  return { id: record.id, name }
}

function defaultHeartRateStorage(): HeartRateStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readRememberedHeartRateDevice(storage: HeartRateStorage | null = defaultHeartRateStorage()) {
  if (!storage) return null

  try {
    const raw = storage.getItem(HEART_RATE_DEVICE_STORAGE_KEY)
    if (!raw) return null
    return parseRememberedHeartRateDevice(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeRememberedHeartRateDevice(
  device: HeartRateRememberedDevice,
  storage: HeartRateStorage | null = defaultHeartRateStorage(),
) {
  if (!storage) return

  try {
    storage.setItem(HEART_RATE_DEVICE_STORAGE_KEY, JSON.stringify({ id: device.id, name: device.name }))
  } catch {
    // Storage can be unavailable in private mode.
  }
}

export function clearRememberedHeartRateDevice(storage: HeartRateStorage | null = defaultHeartRateStorage()) {
  if (!storage) return

  try {
    storage.removeItem(HEART_RATE_DEVICE_STORAGE_KEY)
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function rememberedHeartRateDeviceName(device: HeartRateRememberedDevice | null) {
  return device?.name || 'Wearable'
}

export function findRememberedBluetoothDevice<T extends { id: string }>(
  devices: T[],
  remembered: HeartRateRememberedDevice | null,
) {
  if (!remembered) return undefined
  return devices.find((device) => device.id === remembered.id)
}
