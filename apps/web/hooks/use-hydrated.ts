'use client'

import { useSyncExternalStore } from 'react'

const subscribeNothing = () => () => {}

/**
 * False during the server render and hydration, true on every client render after that. Browser-only values
 * (storage, navigator, document.body) are read once this turns true, so hydration stays identical to the server.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  )
}
