'use client'

import AbilityDragLayer from '@/components/ability-drag-layer'
import {
  ABILITY_CARDS,
  appendUnique,
  dragLeanFromLag,
  insertAt,
  type AbilityCard,
  type AbilityDrag,
} from '@/lib/ability'
import { canApplyAbilityOnIsland } from '@/lib/trade-setup'
import { useAbilityFlippedStore } from '@/stores/ability'
import { useIslandStore } from '@/stores/island'
import { animate, frame, type AnimationPlaybackControls } from 'motion'
import { useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const RETURN_SPRING = { type: 'spring' as const, duration: 0.5, bounce: 0.15 }
const FOLLOW_SPRING = { damping: 80, stiffness: 1000, restDelta: 0.001 }
const APPLY_DURATION_S = 0.2

type AbilityContextValue = {
  rack: AbilityCard[]
  applied: AbilityCard | null
  bound: boolean
  drag: AbilityDrag | null
  overIsland: boolean
  returning: boolean
  islandRef: React.RefObject<HTMLElement | null>
  slotRefs: React.RefObject<Map<number, HTMLElement>>
  beginDrag: (input: {
    card: AbilityCard
    revealed: boolean
    rect: DOMRect
    clientX: number
    clientY: number
    originIndex: number
  }) => void
  bindApplied: () => void
  clearApplied: (cardId?: number) => void
  consumeApplied: (cardId?: number) => void
}

const AbilityContext = createContext<AbilityContextValue | null>(null)

function hitIsland(el: HTMLElement | null, clientX: number, clientY: number) {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

export function AbilityProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false
  const islandRef = useRef<HTMLElement | null>(null)
  const slotRefs = useRef(new Map<number, HTMLElement>())
  const grabRef = useRef({ x: 0, y: 0 })
  const playbackRef = useRef<AnimationPlaybackControls[]>([])
  const xPoint = useMotionValue(0)
  const yPoint = useMotionValue(0)
  const x = useSpring(xPoint, FOLLOW_SPRING)
  const y = useSpring(yPoint, FOLLOW_SPRING)
  const lift = useMotionValue(1)
  const fade = useMotionValue(1)
  const rotate = useTransform([xPoint, x], ([pointerX, cardX]) => dragLeanFromLag(Number(cardX) - Number(pointerX)))
  const [rack, setRack] = useState(ABILITY_CARDS)
  const [applied, setApplied] = useState<AbilityCard | null>(null)
  const [bound, setBound] = useState(false)
  const [drag, setDrag] = useState<AbilityDrag | null>(null)
  const [overIsland, setOverIsland] = useState(false)
  const [returning, setReturning] = useState(false)

  const dragRef = useRef<AbilityDrag | null>(null)
  const appliedRef = useRef<AbilityCard | null>(null)
  const boundRef = useRef(false)
  const returningRef = useRef(false)
  const unbindRef = useRef<(() => void) | null>(null)

  const stopPlayback = useCallback(() => {
    for (const playback of playbackRef.current) playback.stop()
    playbackRef.current = []
  }, [])

  const jumpFollow = useCallback(
    (nextX: number, nextY: number) => {
      xPoint.jump(nextX)
      yPoint.jump(nextY)
      x.jump(nextX)
      y.jump(nextY)
    },
    [x, xPoint, y, yPoint],
  )

  const resetOverlay = useCallback(() => {
    lift.set(1)
    fade.set(1)
    jumpFollow(xPoint.get(), yPoint.get())
  }, [fade, jumpFollow, lift, xPoint, yPoint])

  const unbindPointer = useCallback(() => {
    unbindRef.current?.()
    unbindRef.current = null
  }, [])

  const finishApply = useCallback(
    (card: AbilityCard) => {
      unbindPointer()
      const previous = appliedRef.current
      const previousBound = boundRef.current
      appliedRef.current = card
      boundRef.current = false
      setApplied(card)
      setBound(false)
      if (previous && previous.id !== card.id && !previousBound) {
        setRack((rackNow) => appendUnique(rackNow, previous))
      }
      dragRef.current = null
      returningRef.current = false
      setDrag(null)
      setReturning(false)
      setOverIsland(false)
      resetOverlay()
    },
    [resetOverlay, unbindPointer],
  )

  const finishReturn = useCallback(
    (card: AbilityCard, originIndex: number) => {
      unbindPointer()
      setRack((current) => {
        if (current.some((item) => item.id === card.id)) return current
        return insertAt(current, originIndex, card)
      })
      dragRef.current = null
      returningRef.current = false
      setDrag(null)
      setReturning(false)
      setOverIsland(false)
      resetOverlay()
    },
    [resetOverlay, unbindPointer],
  )

  const beginDrag = useCallback(
    (input: {
      card: AbilityCard
      revealed: boolean
      rect: DOMRect
      clientX: number
      clientY: number
      originIndex: number
    }) => {
      if (!input.revealed) return
      stopPlayback()
      unbindPointer()
      grabRef.current = { x: input.clientX - input.rect.left, y: input.clientY - input.rect.top }
      const startX = input.clientX - grabRef.current.x
      const startY = input.clientY - grabRef.current.y
      jumpFollow(startX, startY)
      lift.set(reduceMotion ? 1 : 1.06)
      fade.set(1)
      returningRef.current = false
      setReturning(false)
      setOverIsland(hitIsland(islandRef.current, input.clientX, input.clientY))
      const session: AbilityDrag = {
        card: input.card,
        revealed: input.revealed,
        width: input.rect.width,
        height: input.rect.height,
        originIndex: input.originIndex,
        grabX: grabRef.current.x,
        grabY: grabRef.current.y,
      }
      dragRef.current = session
      setDrag(session)
      setRack((current) => current.filter((item) => item.id !== input.card.id))

      const followPointer = (clientX: number, clientY: number) => {
        const nextX = clientX - grabRef.current.x
        const nextY = clientY - grabRef.current.y
        if (reduceMotion) {
          jumpFollow(nextX, nextY)
          return
        }
        frame.read(() => {
          xPoint.set(nextX)
          yPoint.set(nextY)
        })
      }

      const onMove = (event: PointerEvent) => {
        if (!dragRef.current || returningRef.current) return
        followPointer(event.clientX, event.clientY)
        const nextOver = hitIsland(islandRef.current, event.clientX, event.clientY)
        setOverIsland((current) => (current === nextOver ? current : nextOver))
      }

      const flyTo = (
        targetX: number,
        targetY: number,
        velocityX: number,
        velocityY: number,
        transition: { type: 'spring'; duration: number; bounce: number } | { duration: number; ease: typeof EASE_OUT },
      ) => {
        const pairedX = animate(x, targetX, {
          ...transition,
          velocity: velocityX,
          onUpdate: (latest) => xPoint.jump(latest),
        })
        const pairedY = animate(y, targetY, {
          ...transition,
          velocity: velocityY,
          onUpdate: (latest) => yPoint.jump(latest),
        })
        return { pairedX, pairedY }
      }

      const onUp = (event: PointerEvent) => {
        const current = dragRef.current
        if (!current || returningRef.current) return
        unbindPointer()

        const currentX = x.get()
        const currentY = y.get()
        const velocityX = x.getVelocity()
        const velocityY = y.getVelocity()
        const card = current.card
        const originIndex = current.originIndex
        jumpFollow(currentX, currentY)

        if (
          hitIsland(islandRef.current, event.clientX, event.clientY) &&
          canApplyAbilityOnIsland(useIslandStore.getState().stage)
        ) {
          if (reduceMotion) {
            finishApply(card)
            return
          }

          returningRef.current = true
          setReturning(true)
          setOverIsland(true)
          const island = islandRef.current?.getBoundingClientRect()
          const targetX = island ? island.left + island.width / 2 - current.width / 2 : currentX
          const targetY = island ? island.top + island.height / 2 - current.height / 2 : currentY
          const { pairedX, pairedY } = flyTo(targetX, targetY, velocityX, velocityY, {
            duration: APPLY_DURATION_S,
            ease: EASE_OUT,
          })
          const liftPlayback = animate(lift, 0.94, { duration: APPLY_DURATION_S, ease: EASE_OUT })
          const fadePlayback = animate(fade, 0, { duration: APPLY_DURATION_S, ease: EASE_OUT })
          playbackRef.current = [pairedX, pairedY, liftPlayback, fadePlayback]
          void pairedX.then(() => finishApply(card))
          return
        }

        returningRef.current = true
        setReturning(true)
        setRack((items) => {
          if (items.some((item) => item.id === card.id)) return items
          return insertAt(items, originIndex, card)
        })

        const home = () => {
          const slot = slotRefs.current.get(card.id)
          if (!slot) {
            finishReturn(card, originIndex)
            return
          }

          const rect = slot.getBoundingClientRect()
          if (reduceMotion) {
            jumpFollow(rect.left, rect.top)
            finishReturn(card, originIndex)
            return
          }

          const { pairedX, pairedY } = flyTo(rect.left, rect.top, velocityX, velocityY, RETURN_SPRING)
          const liftPlayback = animate(lift, 1, { duration: 0.2, ease: EASE_OUT })
          playbackRef.current = [pairedX, pairedY, liftPlayback]
          void pairedX.then(() => finishReturn(card, originIndex))
        }

        requestAnimationFrame(() => requestAnimationFrame(home))
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      unbindRef.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
    },
    [
      fade,
      finishApply,
      finishReturn,
      jumpFollow,
      lift,
      reduceMotion,
      stopPlayback,
      unbindPointer,
      x,
      xPoint,
      y,
      yPoint,
    ],
  )

  const bindApplied = useCallback(() => {
    if (!appliedRef.current) return
    boundRef.current = true
    setBound(true)
  }, [])

  const consumeApplied = useCallback((cardId?: number) => {
    if (cardId != null && appliedRef.current?.id !== cardId) return
    appliedRef.current = null
    boundRef.current = false
    setApplied(null)
    setBound(false)
  }, [])

  const clearApplied = useCallback(
    (cardId?: number) => {
      if (cardId != null && appliedRef.current?.id !== cardId) return
      if (boundRef.current) {
        consumeApplied(cardId)
        return
      }
      const current = appliedRef.current
      if (!current) return
      appliedRef.current = null
      boundRef.current = false
      setApplied(null)
      setBound(false)
      setRack((rackNow) => appendUnique(rackNow, current))
    },
    [consumeApplied],
  )

  useEffect(() => {
    void useAbilityFlippedStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    if (!drag) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [drag])

  useEffect(
    () => () => {
      stopPlayback()
      unbindPointer()
    },
    [stopPlayback, unbindPointer],
  )

  const value = useMemo<AbilityContextValue>(
    () => ({
      rack,
      applied,
      bound,
      drag,
      overIsland,
      returning,
      islandRef,
      slotRefs,
      beginDrag,
      bindApplied,
      clearApplied,
      consumeApplied,
    }),
    [applied, beginDrag, bindApplied, bound, clearApplied, consumeApplied, drag, overIsland, rack, returning],
  )

  return (
    <AbilityContext.Provider value={value}>
      {children}
      <AbilityDragLayer drag={drag} x={x} y={y} lift={lift} fade={fade} rotate={rotate} />
    </AbilityContext.Provider>
  )
}

export function useAbility() {
  const context = useContext(AbilityContext)
  if (!context) {
    throw new Error('useAbility must be used within AbilityProvider')
  }
  return context
}
