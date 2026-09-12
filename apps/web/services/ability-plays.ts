import db from '@/db'
import { abilityPlay, type AbilityPlay } from '@/db/schema'
import type { AbilityKind } from '@/lib/ability'
import type { AbilityPlayStatus } from '@/lib/ability-payout'
import { and, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export type AbilityPlayPayout = {
  to: string
  amount: string
  hash?: string
}

export type CreateAbilityPlayInput = {
  abilityId: number
  kind: AbilityKind
  address: string
  walletId: string
  marketId: string
  outcome: 'YES' | 'NO'
  stakeAmount: number
  shares: number
}

function asUsdString(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(2)
}

export function parseAbilityPayouts(value: string | null | undefined): AbilityPlayPayout[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as AbilityPlayPayout
      if (typeof row.to !== 'string' || typeof row.amount !== 'string') return []
      return [{ to: row.to, amount: row.amount, ...(typeof row.hash === 'string' ? { hash: row.hash } : {}) }]
    })
  } catch {
    return []
  }
}

export async function findAbilityPlayForMarket(address: string, marketId: string) {
  const [play] = await db
    .select()
    .from(abilityPlay)
    .where(and(eq(abilityPlay.address, address.toLowerCase()), eq(abilityPlay.marketId, marketId.toLowerCase())))
    .limit(1)

  return play ?? null
}

export async function pendingAbilityPlays(address?: string) {
  const filters = [inArray(abilityPlay.status, ['pending', 'settling'])]
  if (address) filters.push(eq(abilityPlay.address, address.toLowerCase()))

  return db
    .select()
    .from(abilityPlay)
    .where(and(...filters))
}

export async function insertAbilityPlay(input: CreateAbilityPlayInput): Promise<AbilityPlay | null> {
  const existing = await findAbilityPlayForMarket(input.address, input.marketId)
  if (existing) return existing.status === 'pending' || existing.status === 'settling' ? existing : null

  const [created] = await db
    .insert(abilityPlay)
    .values({
      id: randomUUID(),
      abilityId: input.abilityId,
      kind: input.kind,
      address: input.address.toLowerCase(),
      walletId: input.walletId,
      marketId: input.marketId.toLowerCase(),
      outcome: input.outcome,
      stakeAmount: String(input.stakeAmount),
      shares: String(input.shares),
      status: 'pending',
    })
    .returning()

  return created ?? null
}

export async function claimAbilityPlay(id: string) {
  const [claimed] = await db
    .update(abilityPlay)
    .set({ status: 'settling' })
    .where(and(eq(abilityPlay.id, id), inArray(abilityPlay.status, ['pending', 'settling'])))
    .returning()

  return claimed ?? null
}

export async function releaseAbilityPlay(id: string) {
  await db.update(abilityPlay).set({ status: 'pending', settledAt: null }).where(eq(abilityPlay.id, id))
}

export async function finishAbilityPlay(input: {
  id: string
  status: Extract<AbilityPlayStatus, 'paid' | 'skipped'>
  profit: number
  payoutAmount: number
  payouts: AbilityPlayPayout[]
}) {
  const [updated] = await db
    .update(abilityPlay)
    .set({
      status: input.status,
      profit: String(input.profit),
      payoutAmount: asUsdString(input.payoutAmount),
      payoutsJson: JSON.stringify(input.payouts),
      settledAt: new Date(),
    })
    .where(eq(abilityPlay.id, input.id))
    .returning()

  return updated ?? null
}
