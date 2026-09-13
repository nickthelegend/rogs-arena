'use client'

import { useSyncExternalStore } from 'react'

/**
 * Below Tailwind's `md` breakpoint the arena stacks into one scrolling column (the `max-md:` classes) instead of
 * zooming the desktop grid. Same range syntax as the generated CSS, so JS and CSS switch at the same width.
 */
export const NARROW_LAYOUT_QUERY = '(width < 48rem)'

function subscribeNarrowLayout(onChange: () => void) {
  const query = window.matchMedia(NARROW_LAYOUT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function isNarrowLayout() {
  return window.matchMedia(NARROW_LAYOUT_QUERY).matches
}

/** True on the stacked narrow layout. The server render and hydration assume the desktop layout. */
export function useNarrowLayout() {
  return useSyncExternalStore(subscribeNarrowLayout, isNarrowLayout, () => false)
}
