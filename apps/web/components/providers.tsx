'use client'

import '@/lib/buffer-polyfill'
import '@solana/wallet-adapter-react-ui/styles.css'
import { ArenaChainProvider } from '@/components/arena-chain-provider'
import { ArenaRealtimeProvider } from '@/components/arena-realtime-provider'
import { ArenaWalletProvider } from '@/components/arena-wallet-provider'
import { PreloadGate } from '@/components/preload-gate'
import { env } from '@/env'
import { CurrentMarketProvider } from '@/hooks/use-current-market'
import { PlayerProvider } from '@/hooks/use-player'
import { TradeSetupProvider } from '@/hooks/use-trade-setup'
import { useTraderPresence } from '@/hooks/use-traders'
import { TradingProvider } from '@/hooks/use-trading'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

// Phantom, Solflare and Backpack register through the Wallet Standard, so no adapters are listed here.
const standardWalletsOnly: [] = []
const connectionConfig = { commitment: 'confirmed' as const }

function TraderPresence() {
  useTraderPresence()
  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ConnectionProvider endpoint={env.NEXT_PUBLIC_BASE_RPC_URL} config={connectionConfig}>
      <WalletProvider wallets={standardWalletsOnly} autoConnect>
        <WalletModalProvider>
          <ArenaWalletProvider>
            <ArenaChainProvider>
              <QueryClientProvider client={queryClient}>
                <ArenaRealtimeProvider>
                  <TraderPresence />
                  <CurrentMarketProvider>
                    <PlayerProvider>
                      <TradeSetupProvider>
                        <TradingProvider>
                          <PreloadGate>{children}</PreloadGate>
                        </TradingProvider>
                      </TradeSetupProvider>
                    </PlayerProvider>
                  </CurrentMarketProvider>
                </ArenaRealtimeProvider>
              </QueryClientProvider>
            </ArenaChainProvider>
          </ArenaWalletProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
