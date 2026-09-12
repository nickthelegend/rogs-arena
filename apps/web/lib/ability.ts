export const ABILITY_ACCENT = '#7C5CFF'

export const ABILITY_KINDS = ['double_win', 'protect_loss', 'calm_pulse', 'cheers_win'] as const
export type AbilityKind = (typeof ABILITY_KINDS)[number]

export const ABILITY_PAYOUT_CAP_USD = 10
export const CHEERS_RECIPIENT_COUNT = 10
export const CHEERS_AMOUNT_USD = 1

export type AbilityCard = {
  id: number
  image: string
  front: string
  name: string
  kind: AbilityKind
}

export type AbilityDrag = {
  card: AbilityCard
  revealed: boolean
  width: number
  height: number
  originIndex: number
  grabX: number
  grabY: number
}

export const ABILITY_CARDS: AbilityCard[] = [
  { id: 1, image: '/card-001.png', front: '/cards/001.png', name: 'Double price', kind: 'double_win' },
  { id: 2, image: '/card-002.png', front: '/cards/002.png', name: 'Protect loss', kind: 'protect_loss' },
  { id: 3, image: '/card-003.png', front: '/cards/003.png', name: 'Calm pulse', kind: 'calm_pulse' },
  { id: 4, image: '/card-004.png', front: '/cards/004.png', name: 'Cheers', kind: 'cheers_win' },
]

export function isAbilityKind(value: unknown): value is AbilityKind {
  return typeof value === 'string' && (ABILITY_KINDS as readonly string[]).includes(value)
}

export function abilityCardById(id: number) {
  return ABILITY_CARDS.find((card) => card.id === id) ?? null
}

export function insertAt<T>(list: T[], index: number, item: T) {
  const next = list.slice()
  const clamped = Math.max(0, Math.min(index, next.length))
  next.splice(clamped, 0, item)
  return next
}

export function appendUnique(list: AbilityCard[], card: AbilityCard) {
  if (list.some((item) => item.id === card.id)) return list
  return [...list, card]
}

export function islandAbilityMarketToApply(input: {
  previousMarketId: string | null
  marketId: string | null
  remainingSeconds: number | null
}) {
  if (input.remainingSeconds === 0 && input.marketId) return input.marketId
  if (input.previousMarketId && input.marketId && input.previousMarketId !== input.marketId) {
    return input.previousMarketId
  }
  return null
}

export function appliedAbilityRelease(input: { bound: boolean; playCreated: boolean }): 'consume' | 'return' {
  return input.bound || input.playCreated ? 'consume' : 'return'
}

export function toggleFlippedId(ids: number[], id: number) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

export const DRAG_LEAN_MAX_DEG = 18
export const DRAG_LEAN_FROM_LAG = 0.12

export function dragLeanFromLag(lagX: number) {
  return Math.max(-DRAG_LEAN_MAX_DEG, Math.min(DRAG_LEAN_MAX_DEG, lagX * DRAG_LEAN_FROM_LAG))
}

export function dragLeanDeg({
  vx,
  vy,
  width,
  height,
  grabX,
  grabY,
}: {
  vx: number
  vy: number
  width: number
  height: number
  grabX: number
  grabY: number
}) {
  const comX = width / 2 - grabX
  const comY = height / 2 - grabY
  const hang = Math.max(
    -6,
    Math.min(6, ((Math.atan2(comX, Math.max(comY, 24)) * 180) / Math.PI) * 0.15),
  )
  const trail = (comY * vx - comX * vy) * 0.00042
  return Math.max(-DRAG_LEAN_MAX_DEG, Math.min(DRAG_LEAN_MAX_DEG, hang + trail))
}
