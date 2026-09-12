'use client'

import { PreloadScreen } from '@/components/preload-screen'
import { useCurrentMarket } from '@/hooks/use-current-market'
import { getFirebaseDatabase } from '@/lib/firebase'
import {
  advancePreloadPhase,
  PRELOAD_IMAGE_URLS,
  PRELOAD_MIN_MS,
  PRELOAD_REALTIME_PATHS,
  PRELOAD_TIMEOUT_MS,
  preloadCanReveal,
  preloadFadeMs,
  preloadStatusLabel,
  type PreloadPhase,
} from '@/lib/preload'
import { usePrivy } from '@privy-io/react-auth'
import { get, ref } from 'firebase/database'
import { useReducedMotion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

function preloadImage(url: string) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = url
  })
}

function preloadImages() {
  return Promise.allSettled(PRELOAD_IMAGE_URLS.map(preloadImage))
}

async function preloadRealtime() {
  try {
    const db = getFirebaseDatabase()
    await Promise.allSettled(PRELOAD_REALTIME_PATHS.map((path) => get(ref(db, path))))
  } catch {
    // Boot data is best-effort; the timeout still reveals the page.
  }
}

export function PreloadGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const skip = pathname === '/preload'
  const { ready } = usePrivy()
  const { isLoading } = useCurrentMarket()
  const reduceMotion = useReducedMotion() ?? false
  const fadeMs = preloadFadeMs(reduceMotion)

  const [fontsReady, setFontsReady] = useState(skip)
  const [imagesReady, setImagesReady] = useState(skip)
  const [realtimeReady, setRealtimeReady] = useState(skip)
  const [minElapsed, setMinElapsed] = useState(skip)
  const [timedOut, setTimedOut] = useState(false)
  const [phase, setPhase] = useState<PreloadPhase>(skip ? 'gone' : 'blocking')

  useEffect(() => {
    if (skip) return

    let cancelled = false

    void document.fonts.ready.finally(() => {
      if (!cancelled) setFontsReady(true)
    })
    void preloadImages().finally(() => {
      if (!cancelled) setImagesReady(true)
    })
    void preloadRealtime().finally(() => {
      if (!cancelled) setRealtimeReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [skip])

  useEffect(() => {
    if (skip) return

    const minTimer = window.setTimeout(() => setMinElapsed(true), PRELOAD_MIN_MS)
    const timeoutTimer = window.setTimeout(() => setTimedOut(true), PRELOAD_TIMEOUT_MS)

    return () => {
      window.clearTimeout(minTimer)
      window.clearTimeout(timeoutTimer)
    }
  }, [skip])

  const dataSettled = fontsReady && imagesReady && realtimeReady && !isLoading
  const canReveal = skip
    ? true
    : preloadCanReveal({
        privyReady: ready,
        dataSettled,
        minElapsed,
        timedOut,
      })
  const nextPhase = advancePreloadPhase(phase, canReveal)
  if (nextPhase !== phase) setPhase(nextPhase)
  const status = preloadStatusLabel({
    privyReady: ready,
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
    if (skip || phase === 'gone') return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [phase, skip])

  const blocking = !skip && phase === 'blocking'

  return (
    <>
      <div className="contents" inert={blocking ? true : undefined}>
        {children}
      </div>
      {!skip && phase !== 'gone' ? (
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
