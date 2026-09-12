import { createPublicClient, http } from 'viem'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'
import { Chain } from 'viem'

export const publicClient = createPublicClient({
  chain: somniaShannon as Chain,
  transport: http(),
})
