'use client'

import { isNarrowLayout } from '@/hooks/use-narrow-layout'
import { useEffect, useState, type ReactNode } from 'react'

/** The arena grid (400px | center | 400px) is designed for this width; the island's trading zone needs it. */
export const DESIGN_WIDTH = 1440
const DESIGN_MIN_HEIGHT = 720
const DESIGN_MAX_HEIGHT = 1000

type Fit = { zoom: number; width: number; height: number } | null

function measure(): Fit {
  if (typeof window === 'undefined') return null
  // Phones and other narrow screens get the stacked one-column layout at native scale (the `max-md:` classes).
  if (isNarrowLayout()) return null
  // The root's client size is the device-width viewport. On a phone, innerWidth/innerHeight grow with overflow (the
  // unfitted 1440 px first paint), which would size the zoom to that wider layout viewport instead of the screen.
  const root = document.documentElement
  const viewportWidth = root.clientWidth || window.innerWidth
  const viewportHeight = root.clientHeight || window.innerHeight
  if (viewportWidth >= DESIGN_WIDTH) return null
  const zoom = viewportWidth / DESIGN_WIDTH
  // Keep the desktop proportions: a tall portrait screen would otherwise stretch every panel vertically.
  const height = Math.round(Math.min(Math.max(viewportHeight / zoom, DESIGN_MIN_HEIGHT), DESIGN_MAX_HEIGHT))
  return { zoom, width: DESIGN_WIDTH, height }
}

/**
 * Keeps the existing desktop layout intact on screens between the narrow breakpoint and the design width: the page is
 * laid out at the design width and CSS-zoomed to fit, so nothing overflows horizontally and every control stays on
 * screen and clickable.
 * CSS zoom (unlike transform) keeps hit testing and getBoundingClientRect in viewport coordinates.
 */
export function ViewportFit({ children }: { children: ReactNode }) {
  const [fit, setFit] = useState<Fit>(null)

  useEffect(() => {
    const update = () => setFit(measure())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // The wrapper element is always rendered so switching fit on or off never remounts the app (a remount would
  // restart every data effect and abort its in-flight requests). Unfitted it is display: contents.
  return (
    <div
      className={fit ? 'overflow-hidden [&>main]:h-full [&>main]:w-full' : 'contents'}
      style={fit ? { zoom: fit.zoom, width: fit.width, height: fit.height } : undefined}
    >
      {children}
    </div>
  )
}
