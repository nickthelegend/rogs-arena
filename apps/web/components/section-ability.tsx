'use client'

import AbilityCardFace from '@/components/ability-card-face'
import { useAbility } from '@/components/ability-provider'
import { type AbilityCard as AbilityCardData } from '@/lib/ability'
import { canApplyAbilityOnIsland } from '@/lib/trade-setup'
import { useAbilityFlippedStore } from '@/stores/ability'
import { useIslandStore } from '@/stores/island'
import { animate } from 'motion'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Image from 'next/image'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const edgeThresholdPx = 1
const SCROLL_DURATION_S = 0.2
const DRAG_THRESHOLD_PX = 10
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const
const FLIP_SPRING = { type: 'spring' as const, duration: 0.65, bounce: 0.16 }
const LAYOUT_SPRING = { type: 'spring' as const, duration: 0.4, bounce: 0 }

const fadeClassName =
  'pointer-events-none absolute inset-y-0 z-10 w-16 transition-opacity duration-200 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none'

function readOverflowEdges(el: HTMLElement) {
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= edgeThresholdPx) {
    return { left: false, right: false }
  }

  return {
    left: el.scrollLeft > edgeThresholdPx,
    right: el.scrollLeft < maxScroll - edgeThresholdPx,
  }
}

function itemContentLeft(item: HTMLElement) {
  return item.offsetLeft
}

function nextHiddenScrollLeft(el: HTMLElement, direction: 'left' | 'right') {
  const items = Array.from(el.children) as HTMLElement[]
  const viewLeft = el.scrollLeft
  const viewRight = el.scrollLeft + el.clientWidth
  const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)

  if (direction === 'right') {
    const clipped = items.find((item) => itemContentLeft(item) + item.offsetWidth > viewRight + edgeThresholdPx)
    if (!clipped) return maxScroll
    return Math.min(maxScroll, Math.max(0, itemContentLeft(clipped) + clipped.offsetWidth - el.clientWidth))
  }

  const clipped = [...items].reverse().find((item) => itemContentLeft(item) < viewLeft - edgeThresholdPx)
  if (!clipped) return 0
  return Math.max(0, itemContentLeft(clipped))
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M10 3.5 5.5 8 10 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EdgeArrow({ side, visible, onClick }: { side: 'left' | 'right'; visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Show previous cards' : 'Show next cards'}
      tabIndex={visible ? 0 : -1}
      disabled={!visible}
      onClick={onClick}
      className={`absolute top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] motion-reduce:transition-none ${
        side === 'left' ? 'left-2' : 'right-2'
      } ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <ChevronIcon className={side === 'right' ? 'rotate-180' : undefined} />
    </button>
  )
}

function AbilityCard({ card, index, reduceMotion }: { card: AbilityCardData; index: number; reduceMotion: boolean }) {
  const { beginDrag, drag, slotRefs } = useAbility()
  const revealed = useAbilityFlippedStore((state) => state.flippedIds.includes(card.id))
  const toggleFlipped = useAbilityFlippedStore((state) => state.toggleFlipped)
  const pointerRef = useRef({ x: 0, y: 0, dragging: false, skipClick: false })
  const itemRef = useRef<HTMLLIElement>(null)
  const isGhost = drag?.card.id === card.id
  const canInteract = !drag || isGhost

  const flip = () => {
    if (pointerRef.current.dragging || drag) return
    toggleFlipped(card.id)
  }

  return (
    <motion.li
      ref={(node) => {
        itemRef.current = node
        if (node) slotRefs.current.set(card.id, node)
        else slotRefs.current.delete(card.id)
      }}
      layout={!reduceMotion}
      initial={false}
      transition={{ layout: LAYOUT_SPRING }}
      className={`relative h-full shrink-0 [perspective:800px] ${revealed ? 'z-10' : ''} ${isGhost ? 'pointer-events-none invisible' : ''}`}
    >
      <button
        type="button"
        aria-pressed={revealed}
        aria-label={revealed ? `Hide ${card.name}` : `Reveal ${card.name}`}
        disabled={!canInteract}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          pointerRef.current = { x: event.clientX, y: event.clientY, dragging: false, skipClick: false }
          if (revealed) event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1 || pointerRef.current.dragging || drag) return
          const dx = event.clientX - pointerRef.current.x
          const dy = event.clientY - pointerRef.current.y
          if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return

          pointerRef.current.dragging = true
          pointerRef.current.skipClick = true
          if (!revealed) return

          const node = itemRef.current
          if (!node) return
          beginDrag({
            card,
            revealed: true,
            rect: node.getBoundingClientRect(),
            clientX: event.clientX,
            clientY: event.clientY,
            originIndex: index,
          })
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          if (event.button !== 0) return
          if (pointerRef.current.dragging || drag) return
          pointerRef.current.skipClick = true
          flip()
        }}
        onClick={() => {
          if (pointerRef.current.skipClick) {
            pointerRef.current.skipClick = false
            return
          }
          flip()
        }}
        className={`relative h-full aspect-[376/536] touch-none bg-transparent p-0 transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] motion-reduce:transition-none ${
          revealed ? 'cursor-grab' : 'cursor-pointer'
        }`}
      >
        {reduceMotion ? (
          <>
            <span
              className={`absolute inset-0 transition-opacity duration-200 [transition-timing-function:var(--ease-out)] ${
                revealed ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <Image
                draggable={false}
                src={card.image}
                alt=""
                width={376}
                height={536}
                className="h-full w-full object-cover"
              />
            </span>
            <span
              aria-hidden={!revealed}
              className={`absolute inset-0 transition-opacity duration-200 [transition-timing-function:var(--ease-out)] ${
                revealed ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Image
                draggable={false}
                src={card.front}
                alt=""
                width={376}
                height={536}
                className="h-full w-full object-cover"
              />
            </span>
          </>
        ) : (
          <motion.span
            className="relative block h-full w-full [transform-style:preserve-3d]"
            initial={false}
            animate={{ transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
            transition={FLIP_SPRING}
          >
            <span className="absolute inset-0 [backface-visibility:hidden] [transform:translateZ(0.5px)]">
              <AbilityCardFace card={card} revealed={false} />
            </span>
            <span
              aria-hidden={!revealed}
              className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(0.5px)]"
            >
              <AbilityCardFace card={card} revealed />
            </span>
          </motion.span>
        )}
      </button>
    </motion.li>
  )
}

function TradingZoneHintOverlay({ active, reduceMotion }: { active: boolean; reduceMotion: boolean }) {
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="trading-zone-hint"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.98)' }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'scale(1)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.98)' }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            boxShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.35)',
          }}
        >
          <p className="max-w-[240px] rounded-full bg-black/55 px-4 py-2 text-center font-sans text-sm text-white">
            Enter the trading zone to apply this effect
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default function SectionAbility() {
  const scrollerRef = useRef<HTMLUListElement>(null)
  const playbackRef = useRef<ReturnType<typeof animate> | null>(null)
  const reduceMotion = useReducedMotion() ?? false
  const { rack, drag, returning } = useAbility()
  const stage = useIslandStore((state) => state.stage)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(false)
  const showTradingZoneHint = Boolean(drag) && !returning && !canApplyAbilityOnIsland(stage)

  const syncFades = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return

    const { left, right } = readOverflowEdges(el)
    setShowLeftFade(left)
    setShowRightFade(right)
  }, [])

  const scrollToHidden = useCallback(
    (direction: 'left' | 'right') => {
      const el = scrollerRef.current
      if (!el) return

      const target = nextHiddenScrollLeft(el, direction)
      if (Math.abs(target - el.scrollLeft) <= edgeThresholdPx) return

      playbackRef.current?.stop()

      if (reduceMotion) {
        el.scrollLeft = target
        syncFades()
        return
      }

      playbackRef.current = animate(el.scrollLeft, target, {
        duration: SCROLL_DURATION_S,
        ease: EASE_IN_OUT,
        onUpdate: (value) => {
          el.scrollLeft = value
        },
        onComplete: () => {
          playbackRef.current = null
        },
      })
    },
    [reduceMotion, syncFades],
  )

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const stopPlayback = () => playbackRef.current?.stop()

    syncFades()
    el.addEventListener('scroll', syncFades, { passive: true })
    el.addEventListener('wheel', stopPlayback, { passive: true })
    el.addEventListener('touchstart', stopPlayback, { passive: true })

    const observer = new ResizeObserver(syncFades)
    observer.observe(el)

    return () => {
      playbackRef.current?.stop()
      el.removeEventListener('scroll', syncFades)
      el.removeEventListener('wheel', stopPlayback)
      el.removeEventListener('touchstart', stopPlayback)
      observer.disconnect()
    }
  }, [rack, drag, syncFades])

  return (
    <section className="section-panel relative h-[180px] flex-none p-2">
      <ul ref={scrollerRef} className="relative flex h-full w-full gap-2 overflow-x-auto rounded-lg hide-scrollbar">
        {rack.map((card, index) => (
          <AbilityCard key={card.id} card={card} index={index} reduceMotion={reduceMotion} />
        ))}
      </ul>

      <div
        aria-hidden
        className={`${fadeClassName} left-0 rounded-l-2xl bg-gradient-to-r from-section-background to-transparent ${
          showLeftFade ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`${fadeClassName} right-0 rounded-r-2xl bg-gradient-to-l from-section-background to-transparent ${
          showRightFade ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <EdgeArrow side="left" visible={showLeftFade && !drag} onClick={() => scrollToHidden('left')} />
      <EdgeArrow side="right" visible={showRightFade && !drag} onClick={() => scrollToHidden('right')} />
      <TradingZoneHintOverlay active={showTradingZoneHint} reduceMotion={reduceMotion} />
    </section>
  )
}
