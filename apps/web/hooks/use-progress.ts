'use client'

import { usePlayer } from '@/hooks/use-player'
import { progressFromPlayer, utcDayIndex, type ProgressState } from '@/lib/progress'
import { useEffect, useMemo, useState } from 'react'

const DAY_CHECK_MS = 60_000

/** Progress tracks straight from the on-chain Player account (trades, win streak, calm wins, day trades). */
export function useProgress(): ProgressState {
  const { player } = usePlayer()
  const [dayIndex, setDayIndex] = useState(() => utcDayIndex())

  useEffect(() => {
    const timer = window.setInterval(() => setDayIndex(utcDayIndex()), DAY_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [])

  return useMemo(() => progressFromPlayer(player, dayIndex * 86_400_000), [dayIndex, player])
}
