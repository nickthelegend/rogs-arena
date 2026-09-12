import {
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  SomniaMarkets,
  type SomniaMarketsConfig,
} from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'

export const dreamDexConfig = {
  indexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  chain: somniaShannon,
  wsRpcUrl: somniaShannon.rpcUrls.default.webSocket[0],
  addresses: SOMNIA_TESTNET_ADDRESSES,
  priceFeed: SOMNIA_TESTNET_PRICE_FEED,
} satisfies SomniaMarketsConfig

export function createDreamDexExchange(config: Partial<SomniaMarketsConfig> = {}) {
  return new SomniaMarkets({
    ...dreamDexConfig,
    ...config,
  })
}
