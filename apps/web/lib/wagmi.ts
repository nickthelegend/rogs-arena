import { createConfig } from '@privy-io/wagmi'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'
import { http } from 'wagmi'

export const config = createConfig({
  chains: [somniaShannon],
  transports: {
    [somniaShannon.id]: http(),
  },
})
