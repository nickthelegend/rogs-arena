'use client'

import { BTC_ASSET } from '@/lib/btc'
import { createDreamDexExchange } from '@/lib/dreamdex'
import { formatUsd } from '@/lib/format'
import { SomniaMarketsProvider, useLivePrice } from '@somnia-chain/markets-sdk/react'
import { useEffect, useMemo } from 'react'

function LiveTabNameSync() {
  const btcPrice = useLivePrice(BTC_ASSET)

  useEffect(() => {
    document.title = `Rizz Club | BTC - ${formatUsd(btcPrice?.price)}`
  }, [btcPrice?.price])

  return null
}

export default function LiveTabName() {
  const exchange = useMemo(() => createDreamDexExchange(), [])

  return (
    <SomniaMarketsProvider client={exchange.client}>
      <LiveTabNameSync />
    </SomniaMarketsProvider>
  )
}
