'use client'

import { emptyProgressState, readProgressSnapshot, subscribeProgress } from '@/lib/progress'
import { useSyncExternalStore } from 'react'

export function useProgress() {
  return useSyncExternalStore(subscribeProgress, readProgressSnapshot, emptyProgressState)
}
