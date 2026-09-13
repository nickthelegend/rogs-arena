import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const base58Key = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'must be a base58 public key')
const httpUrl = z.url({ protocol: /^https?$/ })
const wsUrl = z.url({ protocol: /^wss?$/ })

// Client-only configuration. Validation runs here; nothing (connections, clients, sockets) is constructed at import.
export const env = createEnv({
  client: {
    NEXT_PUBLIC_SOLANA_CLUSTER: z.enum(['devnet']),
    NEXT_PUBLIC_BASE_RPC_URL: httpUrl,
    NEXT_PUBLIC_ROUTER_URL: httpUrl,
    NEXT_PUBLIC_ER_RPC_URL: httpUrl,
    NEXT_PUBLIC_ER_WS_URL: wsUrl,
    NEXT_PUBLIC_ER_VALIDATOR: base58Key,
    NEXT_PUBLIC_PROGRAM_ID: base58Key,
    NEXT_PUBLIC_ORACLE_BTC_FEED: base58Key,
    NEXT_PUBLIC_ARENA_API_URL: httpUrl,
    NEXT_PUBLIC_ARENA_WS_URL: wsUrl,
    /** Optional: the CELL-4B pulse bridge on the LAN (tools/cell4b-heart-bridge), used instead of Web Bluetooth. */
    NEXT_PUBLIC_PULSE_BRIDGE_URL: httpUrl.optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
    NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL,
    NEXT_PUBLIC_ROUTER_URL: process.env.NEXT_PUBLIC_ROUTER_URL,
    NEXT_PUBLIC_ER_RPC_URL: process.env.NEXT_PUBLIC_ER_RPC_URL,
    NEXT_PUBLIC_ER_WS_URL: process.env.NEXT_PUBLIC_ER_WS_URL,
    NEXT_PUBLIC_ER_VALIDATOR: process.env.NEXT_PUBLIC_ER_VALIDATOR,
    NEXT_PUBLIC_PROGRAM_ID: process.env.NEXT_PUBLIC_PROGRAM_ID,
    NEXT_PUBLIC_ORACLE_BTC_FEED: process.env.NEXT_PUBLIC_ORACLE_BTC_FEED,
    NEXT_PUBLIC_ARENA_API_URL: process.env.NEXT_PUBLIC_ARENA_API_URL,
    NEXT_PUBLIC_ARENA_WS_URL: process.env.NEXT_PUBLIC_ARENA_WS_URL,
    NEXT_PUBLIC_PULSE_BRIDGE_URL: process.env.NEXT_PUBLIC_PULSE_BRIDGE_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
