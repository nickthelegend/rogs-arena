'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** The arena grid (400px | center | 400px) is designed for this width; the island's trading zone needs it. */
export const DESIGN_WIDTH = 1440
const DESIGN_MIN_HEIGHT = 720
const DESIGN_MAX_HEIGHT = 1000

type Fit = { zoom: number; width: number; height: number } | null

function measure(): Fit {
  if (typeof window === 'undefined') return null
  const viewportWidth = window.innerWidth
  if (viewportWidth >= DESIGN_WIDTH) return null
  const zoom = viewportWidth / DESIGN_WIDTH
  // Keep the desktop proportions: a tall portrait screen would otherwise stretch every panel vertically.
  const height = Math.round(Math.min(Math.max(window.innerHeight / zoom, DESIGN_MIN_HEIGHT), DESIGN_MAX_HEIGHT))
  return { zoom, width: DESIGN_WIDTH, height }
}

/**
 * Keeps the existing desktop layout intact on narrower screens: the page is laid out at the design width and
 * CSS-zoomed to fit, so nothing overflows horizontally and every control stays on screen and clickable.
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

  if (!fit) return <>{children}</>
  return (
    // The page's own w-screen/h-screen would resolve to the unzoomed viewport; inside the fit it fills the canvas.
    <div className="overflow-hidden [&>main]:h-full [&>main]:w-full" style={{ zoom: fit.zoom, width: fit.width, height: fit.height }}>
      {children}
    </div>
  )
}
