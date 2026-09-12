import { LeaderboardItem } from '@/lib/leaderboard'
import { motion } from 'motion/react'
import { forwardRef } from 'react'
import { EASE_OUT } from './constants'
import { leaderboardExitDuration } from '@/lib/leaderboard'
import LeaderboardRow from './leaderboard-row'

export const LeaderboardList = forwardRef<
  HTMLUListElement,
  {
    items: LeaderboardItem[]
    reduceMotion: boolean
    enter: boolean
    frozen: boolean
  }
>(function LeaderboardList({ items, reduceMotion, enter, frozen, ...presence }, ref) {
  return (
    <motion.ul
      ref={ref}
      className="flex flex-col gap-2"
      {...presence}
      initial={false}
      exit={{ opacity: 1 }}
      transition={{ duration: leaderboardExitDuration(items.length, reduceMotion), ease: EASE_OUT }}
    >
      {items.map((item, index) => (
        <LeaderboardRow
          key={item.id}
          item={item}
          index={index}
          reduceMotion={reduceMotion}
          enter={enter}
          frozen={frozen}
        />
      ))}
    </motion.ul>
  )
})
