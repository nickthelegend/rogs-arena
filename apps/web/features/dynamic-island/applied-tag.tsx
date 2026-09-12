import { motion } from 'motion/react'
import { EASE_OUT } from './constants'
import { ABILITY_ACCENT } from '@/lib/ability'

export default function AppliedTag({
  name,
  onClear,
  reduceMotion,
}: {
  name: string
  onClear: () => void
  reduceMotion: boolean
}) {
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px) scale(0.96)' }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px) scale(1)' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px) scale(0.96)' }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="absolute right-5 top-0 z-20 -translate-y-[calc(100%-2px)]"
    >
      <div
        className="flex items-center gap-1.5 rounded-t-md px-2.5 py-1 font-sans text-xs font-medium text-white"
        style={{ backgroundColor: ABILITY_ACCENT }}
      >
        <span>{name}</span>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onClear}
          className="flex size-4 items-center justify-center rounded-sm text-white transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97]"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d="M1.5 1.5 6.5 6.5M6.5 1.5 1.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
