'use client'

import { resolveDisplayName, subscribeDisplayNames, writeDisplayName } from '@/lib/display-name'
import { sanitizeName } from '@/lib/utils'
import { useCallback, useSyncExternalStore } from 'react'

export function useDisplayName(address: string, fallback: string) {
  const getSnapshot = useCallback(() => resolveDisplayName(address, fallback), [address, fallback])
  const getServerSnapshot = useCallback(() => sanitizeName(fallback), [fallback])
  const name = useSyncExternalStore(subscribeDisplayNames, getSnapshot, getServerSnapshot)

  return {
    name,
    save(next: string) {
      if (!address) return
      const clean = sanitizeName(next)
      if (!clean) return
      writeDisplayName(address, clean)
    },
  }
}
