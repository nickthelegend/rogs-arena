import bs58 from 'bs58'
import { z } from 'zod'
import { HttpError } from './errors'
import { DEFAULT_MARKET, isMarketSymbol, UNKNOWN_MARKET_MESSAGE } from './markets'

export function isWalletAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false
  try {
    return bs58.decode(value).length === 32
  } catch {
    return false
  }
}

export const walletSchema = z.string().refine(isWalletAddress, { message: 'Invalid wallet address' })

export const nonceBodySchema = z.object({ wallet: walletSchema })

export const verifyBodySchema = z.object({
  wallet: walletSchema,
  signature: z.string().min(1, 'signature is required').max(128, 'signature is too long'),
})

export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u
const DISPLAY_NAME_LENGTH = 'Display name must be 2-24 characters'

export const profileBodySchema = z.object({
  displayName: z
    .string({ error: 'displayName is required' })
    .trim()
    .min(2, DISPLAY_NAME_LENGTH)
    .max(24, DISPLAY_NAME_LENGTH)
    .regex(DISPLAY_NAME_PATTERN, 'Display name may only contain letters, digits, spaces, _ - .'),
})

const intParam = (name: string) => {
  const message = `${name} must be a non-negative integer`
  return z
    .string({ error: `${name} is required` })
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER, message))
}

// Over-large limits are clamped rather than rejected.
const limitParam = (fallback: number, max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, 'limit must be a positive integer')
    .transform(Number)
    .optional()
    .transform(value => Math.min(value ?? fallback, max))

/** A coin ticker such as BTC or SOL, case-sensitive. */
export const marketSchema = z.string({ error: UNKNOWN_MARKET_MESSAGE }).refine(isMarketSymbol, { message: UNKNOWN_MARKET_MESSAGE })
// A missing market means BTC so clients from before multi-market support keep working.
const marketParam = marketSchema.default(DEFAULT_MARKET)

export const arenaQuerySchema = z.object({ market: marketParam })
export const roundsQuerySchema = z.object({ market: marketParam, limit: limitParam(96, 200) })
export const roundQuerySchema = z.object({ market: marketParam, roundId: intParam('roundId') })
/** An owner-only query (no market, no roundId) spans every market; anything else is scoped to one, BTC by default. */
export const settlementsQuerySchema = z
  .object({
    market: marketSchema.optional(),
    roundId: intParam('roundId').optional(),
    owner: walletSchema.optional(),
  })
  .transform(({ market, ...filters }) =>
    market === undefined && filters.roundId === undefined && filters.owner !== undefined
      ? filters
      : { market: market ?? DEFAULT_MARKET, ...filters },
  )
export const chatQuerySchema = z.object({ limit: limitParam(50, 200) })
export const cheersQuerySchema = z.object({ limit: limitParam(20, 100) })

const BPM_RANGE = 'bpm must be between 30 and 230'
const CHAT_LENGTH = 'Message must be 1-280 characters'

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    sessionId: z.string().min(1, 'sessionId is required').max(128),
    token: z.string().max(256).nullish(),
    market: marketParam,
  }),
  z.object({ type: z.literal('market'), market: marketSchema }),
  z.object({ type: z.literal('presence') }),
  z.object({
    type: z.literal('heart'),
    bpm: z.number().min(30, BPM_RANGE).max(230, BPM_RANGE).transform(Math.round).nullable(),
  }),
  z.object({
    type: z.literal('chat'),
    message: z.string().trim().min(1, CHAT_LENGTH).max(280, CHAT_LENGTH),
  }),
])

export type WsClientMessage = z.output<typeof wsClientMessageSchema>

export function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input'
  return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
}

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new HttpError(400, formatZodError(result.error))
  return result.data
}
