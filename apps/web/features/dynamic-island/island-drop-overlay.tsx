import { ABILITY_ACCENT } from '@/lib/ability'
import { AnimatePresence, motion } from 'motion/react'
import { EASE_OUT } from './constants'

export default function IslandDropOverlay({
  active,
  hovering,
  locked,
  reduceMotion,
}: {
  active: boolean
  hovering: boolean
  locked: boolean
  reduceMotion: boolean
}) {
  const canDrop = !locked && hovering

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="ability-drop"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.98)' }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: canDrop ? 'scale(1.015)' : 'scale(1)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.98)' }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl"
          style={{
            backgroundColor: locked
              ? 'rgba(0, 0, 0, 0.55)'
              : hovering
                ? 'rgba(124, 92, 255, 0.28)'
                : 'rgba(124, 92, 255, 0.16)',
            boxShadow: locked ? 'inset 0 0 0 2px rgba(255, 255, 255, 0.35)' : `inset 0 0 0 2px ${ABILITY_ACCENT}`,
          }}
        >
          <p className="max-w-[280px] rounded-full bg-black/55 px-4 py-2 text-center font-sans text-sm text-white">
            {locked
              ? 'Enter the trading zone to apply this effect'
              : hovering
                ? 'Release to apply'
                : 'Drop the card here to apply effect'}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
