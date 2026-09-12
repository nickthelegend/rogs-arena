import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod'

export const privateKeySchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^['"]|['"]$/g, ''))
  .pipe(z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 0x-prefixed 32-byte hex key'))

export const evmAddressSchema = z.custom<`0x${string}`>(
  (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value),
  { message: 'Must be a 0x-prefixed EVM address' },
)

export const env = createEnv({
  server: {
    FAUCET_PRIVATE_KEY: privateKeySchema,
    WALLET_COUNT: z.coerce.number().int().positive(),

    FIREBASE_API_KEY: z.string().min(1),
    FIREBASE_AUTH_DOMAIN: z.string().min(1),
    FIREBASE_DATABASE_URL: z.url(),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_STORAGE_BUCKET: z.string().min(1),
    FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    FIREBASE_APP_ID: z.string().min(1),
    FIREBASE_MEASUREMENT_ID: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

export function walletPrivateKey(index: number) {
  const parsed = privateKeySchema.safeParse(process.env[`WALLET_${index}_PRIVATE_KEY`])
  if (!parsed.success) {
    throw new Error(`WALLET_${index}_PRIVATE_KEY is missing or invalid`)
  }
  return parsed.data as `0x${string}`
}

export function walletAddress(index: number) {
  const value = process.env[`WALLET_${index}_ADDRESS`]
  if (!value) return undefined
  return evmAddressSchema.parse(value)
}
