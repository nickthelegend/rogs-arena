'use client'

import { PreloadGate } from '@/components/preload-gate'
import { env } from '@/env'
import { CurrentMarketProvider } from '@/hooks/use-current-market'
import { useTraderPresence } from '@/hooks/use-traders'
import { config as wagmiConfig } from '@/lib/wagmi'
import {
  PrivyProvider,
  usePrivy,
  useSigners,
  useUser,
  type LinkedAccountWithMetadata,
  type WalletWithMetadata,
} from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

const queryClient = new QueryClient()

function isServerSignableWallet(account: LinkedAccountWithMetadata): account is WalletWithMetadata {
  return (
    account.type === 'wallet' &&
    account.chainType === 'ethereum' &&
    (account.walletClientType === 'privy' || account.walletClientType === 'privy-v2')
  )
}

function TraderPresence() {
  useTraderPresence()
  return null
}

function WalletSessionSignerManager() {
  const { ready, authenticated, user } = usePrivy()
  const { refreshUser } = useUser()
  const { addSigners } = useSigners()
  const attemptedWallets = useRef(new Set<string>())

  useEffect(() => {
    if (!ready || !authenticated || !user) return

    const wallet = user.linkedAccounts.find(isServerSignableWallet)

    if (!wallet || wallet.id || attemptedWallets.current.has(wallet.address)) return

    attemptedWallets.current.add(wallet.address)

    addSigners({
      address: wallet.address,
      signers: [{ signerId: env.NEXT_PUBLIC_AUTHORIZATION_ID }],
    })
      .then(() => refreshUser())
      .catch((error) => {
        console.error('Failed to provision server signer for embedded wallet:', error)
      })
  }, [addSigners, authenticated, ready, refreshUser, user])

  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={env.NEXT_PUBLIC_PRIVY_APP_ID}
      clientId={env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <WalletSessionSignerManager />
      <TraderPresence />
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <CurrentMarketProvider>
            <PreloadGate>{children}</PreloadGate>
          </CurrentMarketProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
