import { motion } from 'motion/react'
import { ReactNode } from 'react'
import { EASE_OUT } from './constants'

export default function IslandFrame({
  reduceMotion,
  stageKey,
  children,
}: {
  reduceMotion: boolean
  stageKey: string
  children: ReactNode
}) {
  return (
    <motion.div
      key={stageKey}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px) scale(0.98)' }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px) scale(1)' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-6px) scale(0.98)' }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="absolute inset-0 z-10 flex items-center justify-center"
    >
      {children}
    </motion.div>
  )
}
