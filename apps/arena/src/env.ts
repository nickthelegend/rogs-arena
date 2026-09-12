import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { isWalletAddress } from './schemas'

export const APP_DIR = resolve(import.meta.dir, '..')

const pubkey = z.string().refine(isWalletAddress, { message: 'must be a base58 public key' })

// Error messages never echo the value: these variables hold secrets.
const secretKey = z.string().transform((value, ctx) => {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'must be a JSON array of 64 byte values' })
    return z.NEVER
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.length === 64 &&
    parsed.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  if (!valid) {
    ctx.addIssue({ code: 'custom', message: 'must be a JSON array of 64 byte values' })
    return z.NEVER
  }
  return Uint8Array.from(parsed as number[])
})

const flag = z.stringbool().default(true)

export const envSchema = z.object({
  MONGODB_URI: z
    .string({ error: 'is required' })
    .refine(value => /^mongodb(\+srv)?:\/\//.test(value), { message: 'must be a mongodb:// or mongodb+srv:// URI' }),
  MONGODB_DB: z.string({ error: 'is required' }).min(1),
  PROGRAM_ID: pubkey,
  BASE_RPC_URL: z.url(),
  ER_RPC_URL: z.url(),
  ER_WS_URL: z.url(),
  ROUTER_URL: z.url(),
  ER_VALIDATOR: pubkey,
  ORACLE_BTC_FEED: pubkey,
  KEEPER_SECRET_KEY: secretKey,
  FAUCET_SECRET_KEY: secretKey,
  CORS_ORIGIN: z
    .string()
    .default('')
    .transform(value =>
      value
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    ),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  KEEPER_ENABLED: flag,
  INDEXER_ENABLED: flag,
  IDL_PATH: z.string().optional(),
})

export type Env = Omit<z.output<typeof envSchema>, 'IDL_PATH'> & { IDL_PATH: string }

export function resolveIdlPath(explicit?: string): string {
  const candidates = explicit
    ? [resolve(APP_DIR, explicit)]
    : [resolve(APP_DIR, '../../target/idl/rogs_arena.json'), resolve(APP_DIR, 'idl/rogs_arena.json')]
  const found = candidates.find(path => existsSync(path))
  if (!found) throw new Error(`IDL not found; looked in ${candidates.join(', ')}`)
  return found
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join('; ')
    throw new Error(`Invalid environment: ${problems}`)
  }
  return { ...result.data, IDL_PATH: resolveIdlPath(result.data.IDL_PATH) }
}

export const env = parseEnv(process.env)
