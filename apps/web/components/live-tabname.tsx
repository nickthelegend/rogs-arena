'use client'

import { useMarketPrice } from '@/hooks/use-market-price'
import { formatMarketPrice } from '@/lib/format'
import { useEffect } from 'react'

export default function LiveTabName() {
  const { latest, error, symbol, market } = useMarketPrice()
  const decimals = market.priceDecimals

  useEffect(() => {
    if (latest) document.title = `Rogs Arena | ${symbol} - ${formatMarketPrice(latest.price, decimals)}`
    else if (error) document.title = `Rogs Arena | ${symbol} - oracle unavailable`
    else document.title = `Rogs Arena | ${symbol}`
  }, [decimals, error, latest, symbol])

  return null
}
