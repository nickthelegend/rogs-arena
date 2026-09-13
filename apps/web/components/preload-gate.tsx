'use client'

import { useArenaWallet } from '@/components/arena-wallet-provider'
import { PreloadScreen } from '@/components/preload-screen'
import { useCurrentMarket } from '@/hooks/use-current-market'
import { useArenaRealtime } from '@/lib/arena-realtime'
import {
  advancePreloadPhase,
  PRELOAD_IMAGE_URLS,
  PRELOAD_MIN_MS,
  PRELOAD_TIMEOUT_MS,
  preloadCanReveal,
  preloadFadeMs,
  preloadStatusLabel,
  type PreloadPhase,
} from '@/lib/preload'
import { useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

function preloadImage(url: string) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    // Warming the cache only; a missing image shows up broken where it is rendered.
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = url
  })
}

function preloadImages() {
  return Promise.allSettled(PRELOAD_IMAGE_URLS.map(preloadImage))
}

export function PreloadGate({ children }: { children: ReactNode }) {
  const { ready } = useArenaWallet()
  const { isLoading } = useCurrentMarket()
  const snapshotStatus = useArenaRealtime((state) => state.snapshotStatus)
  const reduceMotion = useReducedMotion() ?? false
  const fadeMs = preloadFadeMs(reduceMotion)

  const [fontsReady, setFontsReady] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [minElapsed, setMinElapsed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [phase, setPhase] = useState<PreloadPhase>('blocking')
  // A failed snapshot must not hold the board hostage; each section reports its own load error.
  const realtimeReady = snapshotStatus !== 'loading'

  useEffect(() => {
    let cancelled = false

    void document.fonts.ready.finally(() => {
      if (!cancelled) setFontsReady(true)
    })
    void preloadImages().finally(() => {
      if (!cancelled) setImagesReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const minTimer = window.setTimeout(() => setMinElapsed(true), PRELOAD_MIN_MS)
    const timeoutTimer = window.setTimeout(() => setTimedOut(true), PRELOAD_TIMEOUT_MS)

    return () => {
      window.clearTimeout(minTimer)
      window.clearTimeout(timeoutTimer)
    }
  }, [])

  const dataSettled = fontsReady && imagesReady && realtimeReady && !isLoading
  const canReveal = preloadCanReveal({
    walletReady: ready,
    dataSettled,
    minElapsed,
    timedOut,
  })
  const nextPhase = advancePreloadPhase(phase, canReveal)
  if (nextPhase !== phase) setPhase(nextPhase)
  const status = preloadStatusLabel({
    walletReady: ready,
    fontsReady,
    imagesReady,
    realtimeReady,
    marketReady: !isLoading,
    timedOut,
    phase: nextPhase,
  })

  useEffect(() => {
    if (phase !== 'exiting') return

    const timer = window.setTimeout(() => setPhase('gone'), fadeMs)
    return () => window.clearTimeout(timer)
  }, [fadeMs, phase])

  useEffect(() => {
    if (phase === 'gone') return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [phase])

  const blocking = phase === 'blocking'

  return (
    <>
      <div className="contents" inert={blocking ? true : undefined}>
        {children}
      </div>
      {phase !== 'gone' ? (
        <div
          role="status"
          aria-busy={blocking}
          aria-live="polite"
          aria-label={status}
          className="fixed inset-0 z-[100]"
          style={{
            opacity: phase === 'blocking' ? 1 : 0,
            pointerEvents: blocking ? 'auto' : 'none',
            transitionProperty: 'opacity',
            transitionDuration: `${fadeMs}ms`,
            transitionTimingFunction: 'var(--ease-out)',
          }}
        >
          <PreloadScreen status={status} />
        </div>
      ) : null}
    </>
  )
}
