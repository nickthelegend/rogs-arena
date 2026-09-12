import { LeaderboardItem } from '@/lib/leaderboard'
import { leaderboardStaggerDelay } from '@/lib/leaderboard'
import { LEADERBOARD_FADE_S } from '@/lib/leaderboard'
import { EASE_OUT, profitColor } from './constants'
import { EASE_IN_OUT } from './constants'
import { motion } from 'motion/react'
import Image from 'next/image'
import { FramedAvatar } from '@/components/framed-avatar'
import { YES_COLOR } from '@/lib/outcome'
import { NO_COLOR } from '@/lib/outcome'
import { formatShares } from '@/lib/format'
import { formatCents } from '@/lib/format'
import IconHeartbeat from './icon-heart-beat'
import NumberFlow from '@number-flow/react'
import markPurple from '@/public/mark-purple.png'
import markOrange from '@/public/mark-orange.png'

export default function LeaderboardRow({
  item,
  index,
  reduceMotion,
  enter,
  frozen,
}: {
  item: LeaderboardItem
  index: number
  reduceMotion: boolean
  enter: boolean
  frozen: boolean
}) {
  const inProfit = item.profit >= 0
  const stagger = leaderboardStaggerDelay(index, reduceMotion)
  const fade = { duration: LEADERBOARD_FADE_S, ease: EASE_OUT }

  return (
    <motion.li
      layout="position"
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: item.status === 'closed' ? 0.8 : 1 }}
      exit={{ opacity: 0, transition: { ...fade, delay: stagger } }}
      transition={{
        layout: reduceMotion || frozen ? { duration: 0 } : { duration: 0.22, ease: EASE_IN_OUT },
        opacity: { ...fade, delay: enter ? stagger : 0 },
      }}
      className="relative flex w-full gap-[10px] rounded-xl bg-background p-2"
    >
      <div className="relative">
        <FramedAvatar src={item.avatar} frame={item.frame} alt={item.name} className="aspect-square h-15 w-15" />
        {item.exit ? (
          <span
            className="absolute -top-1 -right-1 rounded-md px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-black"
            style={{ backgroundColor: item.exit === 'tp' ? YES_COLOR : NO_COLOR }}
          >
            {item.exit === 'tp' ? 'TP' : 'SL'}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-2 py-2">
        <div className="font-sans font-medium text-white/90">{item.name}</div>
        <div className="mt-2 flex items-center justify-center gap-1">
          <IconHeartbeat />
          <span className="font-sans text-xs font-medium tabular-nums text-[#6A7374]">
            {item.heartRate == null ? '—' : `${item.heartRate} BPM`}
          </span>
        </div>
      </div>

      <div className="absolute top-2 right-2.5 z-10 h-fit w-fit rounded-lg bg-[#222426]/40 px-2 py-1 backdrop-blur-sm">
        <span className="font-sans text-sm font-semibold text-[#B6BDBC]">
          {formatShares(item.shares)} {item.side === 'up' ? 'UP' : 'DOWN'} @ {formatCents(item.avgPrice)}
        </span>
      </div>

      <div className="absolute right-2 bottom-2 z-10 h-fit w-fit rounded-lg bg-[#222426]/40 px-2 py-1 backdrop-blur-sm">
        <span
          className="font-sans font-semibold tabular-nums"
          style={{ color: inProfit ? profitColor.up : profitColor.down }}
        >
          {inProfit ? '+$' : '-$'}
          <NumberFlow
            value={Math.abs(item.profit)}
            animated={!reduceMotion && !frozen}
            format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
            transformTiming={{ duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}
            spinTiming={{ duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}
            opacityTiming={{ duration: 150, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        </span>
      </div>

      <figure className="absolute top-0 right-0 z-0 h-full w-auto overflow-hidden rounded-tr-lg rounded-br-lg">
        <Image
          draggable={false}
          src={item.side === 'up' ? markPurple : markOrange}
          alt=""
          width={200}
          height={70}
          className="h-full w-full"
        />
      </figure>
    </motion.li>
  )
}
