import {
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  type SomniaMarketsConfig,
} from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'

export const marketRefreshMs = 5_000
export const reconnectDelayMs = 5_000
export const targetAsset = 'BTC'
export const intervalOptions = ['1m', '5m', '15m', '1h'] as const
export type IntervalOption = (typeof intervalOptions)[number]
export const intervalSecondsByLabel = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
} satisfies Record<IntervalOption, number>
export const defaultInterval: IntervalOption = '15m'
export const targetIntervalSeconds = intervalSecondsByLabel[defaultInterval]
export const marketFillLimit = 400
export const dashboardFillLimit = 10
export const dashboardExpiredMarketLimit = 6
export const defaultQuoteDecimals = 6
export const successorPollNearExpiryMs = 15_000
export const successorPollHotMs = 1_000
export const successorPollMsDefault = 3_000
export const etlDebounceMs = 250
export const etlHeartbeatMs = 1_000
export const etlPath = 'market'
export const etlTradesPath = 'trades'

export function isIntervalOption(value: string): value is IntervalOption {
  return (intervalOptions as readonly string[]).includes(value)
}

export function targetMarketLabel(interval: IntervalOption = defaultInterval) {
  return `${targetAsset} ${interval}`
}

export const dreamDexConfig = {
  indexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  chain: somniaShannon,
  wsRpcUrl: somniaShannon.rpcUrls.default.webSocket[0],
  addresses: SOMNIA_TESTNET_ADDRESSES,
  priceFeed: SOMNIA_TESTNET_PRICE_FEED,
} satisfies SomniaMarketsConfig
