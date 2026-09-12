'use client'

import AbilityCardFace from '@/components/ability-card-face'
import { type AbilityDrag } from '@/lib/ability'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function AbilityDragLayer({
  drag,
  x,
  y,
  lift,
  fade,
  rotate,
}: {
  drag: AbilityDrag | null
  x: MotionValue<number>
  y: MotionValue<number>
  lift: MotionValue<number>
  fade: MotionValue<number>
  rotate: MotionValue<number>
}) {
  const transform = useTransform(
    [x, y, lift],
    ([nextX, nextY, nextLift]) => `translate(${nextX}px, ${nextY}px) scale(${nextLift})`,
  )
  const tilt = useTransform(rotate, (angle) => `rotate(${angle}deg)`)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !drag) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <motion.div
        className="absolute top-0 left-0 will-change-transform"
        style={{ width: drag.width, height: drag.height, transform, opacity: fade }}
      >
        <motion.div
          className="h-full w-full will-change-transform"
          style={{
            transformOrigin: `${(drag.grabX / drag.width) * 100}% ${(drag.grabY / drag.height) * 100}%`,
            transform: tilt,
          }}
        >
          <AbilityCardFace card={drag.card} revealed={drag.revealed} />
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  )
}
