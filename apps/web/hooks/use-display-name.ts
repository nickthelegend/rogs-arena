'use client'

import { useArenaAuth } from '@/hooks/use-arena-auth'
import { getProfile, updateProfile } from '@/lib/arena-api'
import {
  clearDisplayName,
  readDisplayName,
  resolveDisplayName,
  subscribeDisplayNames,
  writeDisplayName,
} from '@/lib/display-name'
import { DISPLAY_NAME_MIN_LENGTH, sanitizeName } from '@/lib/utils'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * The trader's display name. The arena service profile is the source of truth (it is what chat and
 * the leaderboard show to everyone); local storage only keeps the last known value for instant paint.
 */
export function useDisplayName(address: string, fallback: string) {
  const { wallet, token, signIn } = useArenaAuth()
  const getSnapshot = useCallback(() => resolveDisplayName(address, fallback), [address, fallback])
  const getServerSnapshot = useCallback(() => sanitizeName(fallback), [fallback])
  const name = useSyncExternalStore(subscribeDisplayNames, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (!address) return
    const controller = new AbortController()
    getProfile(address, controller.signal).then(
      (profile) => {
        const saved = profile?.displayName ? sanitizeName(profile.displayName) : ''
        if (saved.length >= DISPLAY_NAME_MIN_LENGTH) writeDisplayName(address, saved)
      },
      // Offline or aborted: the last known name stays on screen until the service answers again.
      () => undefined,
    )
    return () => controller.abort()
  }, [address])

  const save = useCallback(
    async (next: string) => {
      if (!address) return
      const clean = sanitizeName(next)
      if (clean.length < DISPLAY_NAME_MIN_LENGTH) return
      const previous = readDisplayName(address)
      writeDisplayName(address, clean)
      try {
        const sessionToken = wallet === address && token ? token : (await signIn()).token
        const profile = await updateProfile(sessionToken, clean)
        if (profile.displayName) writeDisplayName(address, sanitizeName(profile.displayName))
      } catch {
        // Not saved on the service, so do not keep showing it as the trader's name.
        if (previous) writeDisplayName(address, previous)
        else clearDisplayName(address)
      }
    },
    [address, signIn, token, wallet],
  )

  return { name, save }
}
