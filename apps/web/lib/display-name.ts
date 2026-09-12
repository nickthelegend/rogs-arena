import { sanitizeName } from '@/lib/utils'

export const DISPLAY_NAME_STORAGE_KEY = 'rizz.displayName'

export type DisplayNameStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const listeners = new Set<() => void>()

export function subscribeDisplayNames(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyDisplayNames() {
  for (const listener of listeners) listener()
}

function defaultDisplayNameStorage(): DisplayNameStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function parseDisplayNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const names: Record<string, string> = {}
  for (const [address, name] of Object.entries(value as Record<string, unknown>)) {
    if (typeof name !== 'string') continue
    const clean = sanitizeName(name)
    if (clean) names[address.toLowerCase()] = clean
  }
  return names
}

function readAllDisplayNames(storage: DisplayNameStorage | null) {
  if (!storage) return {}

  try {
    const raw = storage.getItem(DISPLAY_NAME_STORAGE_KEY)
    if (!raw) return {}
    return parseDisplayNames(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export function readDisplayName(address: string, storage: DisplayNameStorage | null = defaultDisplayNameStorage()) {
  if (!address) return null
  return readAllDisplayNames(storage)[address.toLowerCase()] ?? null
}

export function writeDisplayName(
  address: string,
  name: string,
  storage: DisplayNameStorage | null = defaultDisplayNameStorage(),
) {
  const key = address.toLowerCase()
  const clean = sanitizeName(name)
  if (!storage || !key || !clean) return

  try {
    const names = readAllDisplayNames(storage)
    names[key] = clean
    storage.setItem(DISPLAY_NAME_STORAGE_KEY, JSON.stringify(names))
    notifyDisplayNames()
  } catch {
    // Storage can be unavailable in private mode.
  }
}

export function resolveDisplayName(
  address: string,
  fallback: string,
  storage: DisplayNameStorage | null = defaultDisplayNameStorage(),
) {
  return readDisplayName(address, storage) ?? sanitizeName(fallback)
}