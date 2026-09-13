'use client'

import { arenaRealtime } from '@/lib/arena-realtime'
import { useEffect, type ReactNode } from 'react'

export function ArenaRealtimeProvider({ children }: { children: ReactNode }) {
  useEffect(() => arenaRealtime().retain(), [])

  return children
}
