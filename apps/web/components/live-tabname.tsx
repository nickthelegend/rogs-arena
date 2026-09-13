'use client'

import { useBtcPrice } from '@/hooks/use-btc-price'
import { formatUsd } from '@/lib/format'
import { useEffect } from 'react'

export default function LiveTabName() {
  const { latest, error } = useBtcPrice()

  useEffect(() => {
    if (latest) document.title = `Rogs Arena | BTC - ${formatUsd(latest.price)}`
    else if (error) document.title = 'Rogs Arena | BTC - oracle unavailable'
    else document.title = 'Rogs Arena | BTC'
  }, [error, latest])

  return null
}
