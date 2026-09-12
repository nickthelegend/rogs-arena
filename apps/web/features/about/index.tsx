'use client'

import { formatGmt7Time } from '@/lib/format'
import { cn } from 'cn'
import { useEffect, useState } from 'react'

export default function SectionAbout() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => setTime(formatGmt7Time())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="section-panel font-sans flex-none gap-2 p-2 flex justify-between select-none">
      <div className="p-1 px-1.5 rounded-lg w-fit">
        <span className={cn('text-[#6A7374] font-regular text-sm')}>{'{s}{d}'}</span>
      </div>
      <div className="p-1 px-1.5 rounded-lg w-fit">
        <span className={cn('text-[#6A7374] font-regular tabular-nums text-sm')}>{time}</span>
      </div>
      <div className="p-1 px-1.5 bg-[url('/background-texture.webp')] mix-blend-exclusion bg-cover bg-center leading-none rounded-lg w-fit">
        <span className={cn('text-white font-regular text-sm')}>Version 0.1.12-oven</span>
      </div>
    </section>
  )
}
