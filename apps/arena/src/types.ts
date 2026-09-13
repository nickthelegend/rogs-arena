// DTOs from docs/ARENA-API.md. Keep in lockstep with the web app.

export type Outcome = 'YES' | 'NO'

export type RoundDto = {
  market: string
  roundId: number
  startTs: number
  endTs: number
  strikePrice: string
  closePrice: string | null
  priceExpo: number
  outcome: Outcome | null
  yesPool: number
  noPool: number
  volume: number
  trades: number
  openedSig: string | null
  resolvedSig: string | null
}

export type TradeDto = {
  id: string
  sig: string
  market: string
  roundId: number
  owner: string
  side: 'BUY' | 'SELL'
  outcome: Outcome
  amount: number
  shares: number
  price: number
  yesPrice: number
  fee: number
  realizedPnl: number
  ability: number
  t: number
}

export type PointDto = { market: string; roundId: number; t: number; yes: number; no: number; source: 'chain' }

export type CloseDto = {
  id: string
  market: string
  roundId: number
  trader: string
  outcome: Outcome
  exit: 'tp' | 'sl'
  profit: number
  shares: number
  t: number
}

export type SettlementDto = {
  id: string
  sig: string
  market: string
  roundId: number
  owner: string
  outcome: Outcome
  payout: number
  profit: number
  ability: number
  bonus: number
  calm: boolean
  cheers: boolean
  t: number
}

export type TraderDto = {
  address: string
  name: string
  status: 'online' | 'offline'
  lastSeen: number
  heartRate: number | null
  heartRateAt: number | null
  isBot: boolean
}

export type ChatDto = { id: string; address: string; name: string; message: string; t: number }

export type CheersDto = {
  sig: string
  /** Market whose arena paid the cheers, read from the callback transaction; null if that transaction was unreadable. */
  market: string | null
  owner: string
  recipients: string[]
  amountEach: number
  randomness: string
  t: number
}

export type ProfileDto = { wallet: string; displayName: string | null; createdAt: number; updatedAt: number }

export type ArenaSnapshot = {
  market: string
  round: RoundDto | null
  recentRounds: RoundDto[]
  trades: TradeDto[]
  points: PointDto[]
  closes: CloseDto[]
  traders: TraderDto[]
  anonymous: number
  online: number
  chat: ChatDto[]
  cheers: CheersDto[]
  serverTime: number
}

export type MarketDto = {
  market: string
  id: number
  name: string
  color: string
  priceDecimals: number
  arena: string
  oracleFeed: string
  available: boolean
  round: RoundDto | null
}

export type HealthMarketDto = {
  market: string
  available: boolean
  roundId: number | null
  /** 'idle' | 'open' | 'resolved' */
  status: string | null
  endTs: number | null
}

export type ServiceStatus = {
  indexer: { enabled: boolean; lastSig: string | null; lastEventAt: number | null }
  keeper: { enabled: boolean; lastRollSig: string | null; lastRollAt: number | null }
}
