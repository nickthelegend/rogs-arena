import { PublicKey } from '@solana/web3.js'

import idl from './idl/rogs_arena.json'

export const PROGRAM_ID = new PublicKey(idl.address)

export const ARENA_SEED = 'arena'
export const PLAYER_SEED = 'player'
export const SESSION_TOKEN_V2_SEED = 'session_token_v2'

/** Chips use 6 decimals: 1 USD = 1_000_000. Mirrors programs/rogs-arena/src/constants.rs. */
export const USD = 1_000_000n
export const BPS = 10_000n

export const TRADE_LOCK_SECONDS = 5
export const ABILITY_LOCK_SECONDS = 30
export const MAX_PRICE_AGE_SECONDS = 10
export const MIN_TRADE = 1_000_000n
export const MAX_TRADE = 100_000_000n
export const START_CHIPS = 250_000_000n
export const FAUCET_AMOUNT = 100_000_000n
export const FAUCET_COOLDOWN_SECONDS = 3_600
export const FAUCET_MAX_BALANCE = 50_000_000n
export const ABILITY_CAP = 10_000_000n
export const CALM_BPM_LIMIT = 120
export const HEART_BPM_MIN = 30
export const HEART_BPM_MAX = 230
export const HEART_FRESH_SECONDS = 30
export const CHEERS_RECIPIENTS = 10
export const CHEERS_AMOUNT = 1_000_000n
export const MAX_CHEERS_CANDIDATES = 12
export const CHEERS_TIMEOUT_SECONDS = 120
export const HISTORY_LEN = 64
export const RECENT_TRADERS = 16
export const POSITION_SLOTS = 4
export const MIN_ROUND_LEAD_SECONDS = 60

export const OUTCOME_NONE = 0
export const OUTCOME_YES = 1
export const OUTCOME_NO = 2
export type OutcomeCode = typeof OUTCOME_YES | typeof OUTCOME_NO

export const SIDE_BUY = 0
export const SIDE_SELL = 1

export const ROUND_IDLE = 0
export const ROUND_OPEN = 1
export const ROUND_RESOLVED = 2

export const ABILITY_NONE = 0
export const ABILITY_DOUBLE = 1
export const ABILITY_PROTECT = 2
export const ABILITY_CALM = 3
export const ABILITY_CHEERS = 4

export const BADGE_TRADE_MASTER = 1
export const BADGE_STREAK_CLIMBER = 2
export const BADGE_STEAL_HEART = 4
export const BADGE_DAY_TRADER = 8

/** MagicBlock programs and shared accounts. */
export const ORACLE_PROGRAM_ID = new PublicKey('PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd')
export const BTC_USD_FEED = new PublicKey('71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr')
export const PRICE_UPDATE_DISCRIMINATOR = Uint8Array.from([234, 161, 14, 36, 172, 239, 15, 232])
export const VRF_EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc')
export const VRF_PROGRAM_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz')
export const SESSION_PROGRAM_ID = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5')
export const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')
export const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111')
export const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111')

export type ArenaEndpoints = {
  baseRpcUrl: string
  erRpcUrl: string
  erWsUrl: string
  routerUrl: string
  validator: PublicKey
}

/** Devnet defaults; every value is overridable through app env. */
export const DEVNET_ENDPOINTS: ArenaEndpoints = {
  baseRpcUrl: 'https://rpc.magicblock.app/devnet',
  erRpcUrl: 'https://devnet-as.magicblock.app',
  erWsUrl: 'wss://devnet-as.magicblock.app',
  routerUrl: 'https://devnet-router.magicblock.app',
  validator: new PublicKey('MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57'),
}

export function explorerTxUrl(signature: string, layer: 'base' | 'er') {
  if (layer === 'base') return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
  return `https://solscan.io/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent('https://devnet-as.magicblock.app')}`
}

export function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`
}
