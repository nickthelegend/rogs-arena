'use client'

import { useLeaderboard } from '@/hooks/use-leaderboard'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { LeaderboardList } from './leaderboard-list'

export default function SectionLeaderboard() {
  const { items, epoch, frozen, status } = useLeaderboard()
  const reduceMotion = useReducedMotion() ?? false

  return (
    <section className="section-panel flex min-h-0 flex-1 flex-col gap-2 overflow-hidden select-none relative">
      <motion.div layoutScroll className="min-h-0 flex-1 overflow-y-auto rounded-lg hide-scrollbar">
        {items.length === 0 ? (
          <p className="px-2 py-3 font-sans text-sm text-[#6A7374]">
            {status === 'error'
              ? 'Could not load trades.'
              : status === 'loading'
                ? 'Syncing positions...'
                : 'Waiting for positions...'}
          </p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <LeaderboardList key={epoch} items={items} reduceMotion={reduceMotion} enter={epoch > 0} frozen={frozen} />
          </AnimatePresence>
        )}

        <div className="pointer-events-none absolute w-full bottom-0 h-[50%] bg-gradient-to-t from-section-background to-transparent z-10"></div>
      </motion.div>
    </section>
  )
}
