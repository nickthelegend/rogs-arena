'use client'

import { type AbilityCard } from '@/lib/ability'
import Image from 'next/image'

export default function AbilityCardFace({ card, revealed }: { card: AbilityCard; revealed: boolean }) {
  return (
    <Image
      draggable={false}
      src={revealed ? card.front : card.image}
      alt=""
      width={376}
      height={536}
      className="h-full w-full object-cover"
    />
  )
}
