import {
  ABILITY_PAYOUT_CAP_USD,
  CHEERS_AMOUNT_USD,
  CHEERS_RECIPIENT_COUNT,
  type AbilityKind,
} from '@/lib/ability'

export type AbilityPlayStatus = 'pending' | 'settling' | 'paid' | 'skipped'

export type AbilityPayoutPlan = {
  playerUsd: number
  cheersUsd: number
  cheersCount: number
}

export type AbilitySettlement = {
  kind: AbilityKind
  status: AbilityPlayStatus
  won: boolean | null
  profit: number
  playerUsd: number
  recipientCount: number
}

export function roundUsd(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export function capUsd(value: number, cap = ABILITY_PAYOUT_CAP_USD) {
  return Math.max(0, Math.min(roundUsd(value), cap))
}

export function closeProfitUsd(input: {
  stakeAmount: number
  shares: number
  soldShares: number
  proceeds: number
}) {
  if (input.shares <= 0 || input.soldShares <= 0) return 0

  const fraction = Math.min(1, input.soldShares / input.shares)
  return roundUsd(input.proceeds - input.stakeAmount * fraction)
}

export function settlementProfitUsd(input: { won: boolean; stakeAmount: number; shares: number }) {
  if (input.won) return roundUsd(input.shares - input.stakeAmount)
  return roundUsd(-Math.max(0, input.stakeAmount))
}

export function abilityWon(profit: number) {
  if (!Number.isFinite(profit) || profit === 0) return null
  return profit > 0
}

export function playerBonusUsd(kind: AbilityKind, won: boolean | null, profit: number) {
  if (won == null) return 0

  if (kind === 'double_win') return won ? capUsd(profit) : 0
  if (kind === 'protect_loss') return won ? 0 : capUsd(-profit)
  if (kind === 'calm_pulse') return won ? ABILITY_PAYOUT_CAP_USD : 0
  return 0
}

export function abilityPayoutPlan(kind: AbilityKind, won: boolean | null, profit: number): AbilityPayoutPlan {
  return {
    playerUsd: playerBonusUsd(kind, won, profit),
    cheersUsd: kind === 'cheers_win' && won ? CHEERS_AMOUNT_USD : 0,
    cheersCount: kind === 'cheers_win' && won ? CHEERS_RECIPIENT_COUNT : 0,
  }
}

export function pickCheersRecipients(
  addresses: string[],
  winner: string,
  count = CHEERS_RECIPIENT_COUNT,
  random: () => number = Math.random,
) {
  const winnerKey = winner.toLowerCase()
  const pool: string[] = []
  const seen = new Set<string>()

  for (const address of addresses) {
    const key = address.toLowerCase()
    if (!key || key === winnerKey || seen.has(key)) continue
    seen.add(key)
    pool.push(address)
  }

  for (let index = pool.length - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1))
    const current = pool[index]
    const next = pool[swapWith]
    if (current == null || next == null) continue
    pool[index] = next
    pool[swapWith] = current
  }

  return pool.slice(0, Math.max(0, count))
}

export function formatAbilitySettlement(settlement: AbilitySettlement) {
  if (settlement.status === 'skipped' || settlement.status === 'pending') return null

  if (settlement.kind === 'cheers_win') {
    if (settlement.recipientCount <= 0) return 'Cheers found no other traders to pay.'
    return `Cheers sent $1 to ${settlement.recipientCount} trader${settlement.recipientCount === 1 ? '' : 's'}.`
  }

  if (settlement.playerUsd <= 0) return null
  return `Ability paid $${settlement.playerUsd.toFixed(2)}.`
}
