import { toHuman } from '@somnia-chain/markets-sdk'

export function rawToHuman(value: string | null | undefined, decimals: number) {
  if (value == null) return undefined

  try {
    const amount = toHuman(value, decimals)
    return Number.isFinite(amount) ? amount : undefined
  } catch {
    return undefined
  }
}

export function rawToProbability(value: string | null | undefined, decimals: number) {
  const probability = rawToHuman(value, decimals)
  if (probability === undefined) return undefined
  return Math.max(0, Math.min(1, probability))
}

export function bigintToProbability(value: bigint | undefined, decimals: number) {
  if (value === undefined) return undefined

  try {
    const probability = toHuman(value, decimals)
    if (!Number.isFinite(probability)) return undefined
    return Math.max(0, Math.min(1, probability))
  } catch {
    return undefined
  }
}
