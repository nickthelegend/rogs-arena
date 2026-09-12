'use client'

import { useMarketHistory } from '@/hooks/use-market-history'
import { formatGmt7Hm } from '@/lib/format'
import { type HistoryOutcome } from '@/lib/market-history'
import { NO_COLOR, YES_COLOR } from '@/lib/outcome'
import { cn } from 'cn'
import { useEffect, useMemo, useRef, useState } from 'react'

type Point = {
  x: number
  y: number
}

const stepMs = 5 * 60 * 1000
const hourMs = 60 * 60 * 1000
const gmt7OffsetMs = 7 * hourMs
const windowMs = 1 * 60 * 60 * 1000
const itemsPerRow = 6
const rowHeight = 90
const insetX = 12
const rowPadX = 36
const cornerRadius = 24
const stub = 28
const boxSizeRatio = 0.82
const maxBoxSize = 72
const boxTopGap = 16
const firstRowY = 36

function roundedPathFromPoints(points: Point[], r: number) {
  if (points.length < 2) return ''
  const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y })
  const norm = (v: Point) => {
    const len = Math.hypot(v.x, v.y) || 1
    return { x: v.x / len, y: v.y / len }
  }

  let d = `M ${points[0].x} ${points[0].y} `

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]
    if (!prev || !curr || !next) continue

    const din = norm(sub(curr, prev))
    const dout = norm(sub(next, curr))

    const segLen = Math.min(
      Math.hypot(sub(curr, prev).x, sub(curr, prev).y),
      Math.hypot(sub(next, curr).x, sub(next, curr).y),
    )
    const radius = Math.min(r, segLen / 2)

    const p1 = { x: curr.x - din.x * radius, y: curr.y - din.y * radius }
    const p2 = { x: curr.x + dout.x * radius, y: curr.y + dout.y * radius }

    const cross = din.x * dout.y - din.y * dout.x
    const sweep = cross > 0 ? 1 : 0

    d += `L ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 ${sweep} ${p2.x} ${p2.y} `
  }

  const last = points[points.length - 1]
  if (!last) return d
  d += `L ${last.x} ${last.y}`
  return d
}

function buildSerpentineWaypoints({
  width,
  insetX,
  rowHeight,
  stub,
  rows,
  firstRowY,
}: {
  width: number
  insetX: number
  rowHeight: number
  stub: number
  rows: number
  firstRowY: number
}) {
  const xLeft = insetX
  const xRight = width - insetX

  const points: Point[] = []
  let goingLeft = true
  let y = -stub
  let x = xRight

  points.push({ x, y })

  y = firstRowY
  points.push({ x, y })

  for (let i = 0; i < rows; i++) {
    x = goingLeft ? xLeft : xRight
    points.push({ x, y })
    if (i < rows - 1) {
      y += rowHeight
      points.push({ x, y })
      goingLeft = !goingLeft
    }
  }

  points.push({ x, y: y + stub })
  return points
}

type Item = {
  time: number
  label: string
  isCurrent: boolean
  isPast: boolean
  outcome: HistoryOutcome | null
}

function startOfHourGmt7(ms: number) {
  return Math.floor((ms + gmt7OffsetMs) / hourMs) * hourMs - gmt7OffsetMs
}

function generateTimeSlots(now: number): Item[] {
  const aligned = Math.floor(now / stepMs) * stepMs
  const start = startOfHourGmt7(aligned - windowMs)
  const end = startOfHourGmt7(aligned + windowMs) + hourMs - stepMs
  const slots: Item[] = []

  for (let time = start; time <= end; time += stepMs) {
    slots.push({
      time,
      label: formatGmt7Hm(time),
      isCurrent: time === aligned,
      isPast: time < aligned,
      outcome: null,
    })
  }

  return slots
}

function itemX(colIndex: number, rowIndex: number, colWidth: number, startX: number) {
  const goingLeft = rowIndex % 2 === 0
  return goingLeft ? startX + (itemsPerRow - 1 - colIndex) * colWidth : startX + colIndex * colWidth
}

function currentRowMaxScrollTop(items: Item[]) {
  const currentIndex = items.findIndex((item) => item.isCurrent)
  if (currentIndex < 0) return 0
  return Math.floor(currentIndex / itemsPerRow) * rowHeight
}

function easeOutQuint(t: number) {
  return 1 - (1 - t) ** 5
}

function animateScrollTo(scroller: HTMLElement, to: number, duration = 400) {
  const from = scroller.scrollTop
  const delta = to - from
  if (delta === 0) return () => {}

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    scroller.scrollTop = to
    return () => {}
  }

  let frame = 0
  let cancelled = false
  const startedAt = performance.now()

  const cancel = () => {
    cancelled = true
    if (frame) cancelAnimationFrame(frame)
  }

  const tick = (now: number) => {
    if (cancelled) return
    const t = Math.min(1, (now - startedAt) / duration)
    scroller.scrollTop = from + delta * easeOutQuint(t)
    if (t < 1) frame = requestAnimationFrame(tick)
  }

  const stop = () => cancel()
  scroller.addEventListener('wheel', stop, { passive: true, once: true })
  scroller.addEventListener('touchstart', stop, { passive: true, once: true })
  scroller.addEventListener('pointerdown', stop, { once: true })

  frame = requestAnimationFrame(tick)
  return () => {
    cancel()
    scroller.removeEventListener('wheel', stop)
    scroller.removeEventListener('touchstart', stop)
    scroller.removeEventListener('pointerdown', stop)
  }
}

function SerpentineTimeline({ items }: { items: Item[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)
  const [width, setWidth] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const scroller = scrollRef.current
    const inner = containerRef.current
    if (!scroller || !inner) return

    const observer = new ResizeObserver(() => {
      setWidth(inner.clientWidth)
      setViewportHeight(scroller.clientHeight)
    })
    observer.observe(scroller)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  const rows: Item[][] = []
  for (let i = 0; i < items.length; i += itemsPerRow) {
    rows.push(items.slice(i, i + itemsPerRow))
  }

  const lastRowY = rows.length === 0 ? firstRowY : firstRowY + rowHeight * (rows.length - 1)
  const fullHeight = lastRowY + boxTopGap + maxBoxSize + stub
  const maxScrollTop = currentRowMaxScrollTop(items)
  const height = viewportHeight > 0 ? Math.min(fullHeight, maxScrollTop + viewportHeight) : fullHeight

  const itemInsetX = insetX + rowPadX
  const waypoints =
    width > 0 && rows.length > 0
      ? buildSerpentineWaypoints({ width, insetX, rowHeight, stub, rows: rows.length, firstRowY })
      : []
  const d = waypoints.length ? roundedPathFromPoints(waypoints, cornerRadius) : ''

  const colWidth = width > 0 ? (width - itemInsetX * 2) / (itemsPerRow - 1) : 0
  const boxSize = Math.min(colWidth * boxSizeRatio, maxBoxSize)

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || !width || viewportHeight === 0 || items.length === 0 || didScrollRef.current) return
    didScrollRef.current = true
    animateScrollTo(scroller, maxScrollTop)
  }, [width, viewportHeight, items.length, maxScrollTop])

  return (
    <section className="section-panel flex-none h-[200px] overflow-hidden select-none relative">
      <div ref={scrollRef} className="h-full overflow-x-hidden overflow-y-auto overscroll-y-none hide-scrollbar">
        <div ref={containerRef} className="relative w-full overflow-hidden bg-section-background" style={{ height }}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              className="pointer-events-none absolute top-0 left-0 block"
            >
              <path d={d} fill="none" stroke="#3B3B3B" strokeWidth={3} strokeDasharray="8 8" strokeLinecap="round" />
            </svg>
          )}

          {width > 0 &&
            rows.map((row, rowIndex) => {
              const rowY = firstRowY + rowHeight * rowIndex

              return row.map((item, colIndex) => {
                const x = itemX(colIndex, rowIndex, colWidth, itemInsetX)

                return (
                  <div key={item.time} data-current={item.isCurrent ? 'true' : undefined} className="relative">
                    <div
                      className={cn(
                        'font-sans absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 bg-section-background p-2 text-sm whitespace-nowrap tabular-nums font-medium',
                        item.isCurrent ? 'text-white' : item.isPast ? 'text-[#8a8a8a]' : 'text-[#6A7374]',
                      )}
                      style={{ left: x, top: rowY }}
                    >
                      {item.label}
                    </div>

                    <div
                      className="absolute flex -translate-x-1/2 items-center justify-center"
                      style={{
                        left: x,
                        top: rowY + boxTopGap,
                        width: boxSize,
                        height: boxSize,
                        borderRadius: boxSize * 0.28,
                        background: item.isCurrent ? '#525252' : item.isPast ? '#3a3a3a' : '#2a2a2a',
                        boxShadow: item.isCurrent ? 'inset 0 0 0 1px rgba(255,255,255,0.28)' : undefined,
                      }}
                      aria-label={
                        item.outcome === 'Y'
                          ? `${item.label} YES`
                          : item.outcome === 'N'
                            ? `${item.label} NO`
                            : item.label
                      }
                    >
                      {item.outcome ? (
                        <span
                          className="font-abc-gravity-italic leading-none"
                          style={{
                            fontSize: boxSize * 0.46,
                            color: item.outcome === 'Y' ? YES_COLOR : NO_COLOR,
                          }}
                        >
                          {item.outcome}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })
            })}
        </div>
      </div>

      <div className="pointer-events-none absolute w-full bottom-0 h-[50%] bg-gradient-to-t from-section-background to-transparent z-10"></div>
    </section>
  )
}

export default function SectionHistory() {
  const [now, setNow] = useState<number | null>(null)
  const { outcomes } = useMarketHistory()
  const items = useMemo(() => {
    if (now == null) return []
    return generateTimeSlots(now).map((item) => ({
      ...item,
      outcome: item.isPast ? (outcomes[item.time] ?? null) : null,
    }))
  }, [now, outcomes])

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  return <SerpentineTimeline items={items} />
}
