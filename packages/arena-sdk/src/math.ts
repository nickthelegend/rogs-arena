/**
 * Bigint mirror of programs/rogs-arena/src/math.rs. Used for client quotes
 * (min_shares / min_out slippage bounds) and cross-checked in tests against
 * the same vectors as the Rust unit tests.
 */
import {
  ABILITY_CALM,
  ABILITY_CAP,
  ABILITY_CHEERS,
  ABILITY_DOUBLE,
  ABILITY_PROTECT,
  BPS,
  CALM_BPM_LIMIT,
  HEART_BPM_MIN,
  MIN_ROUND_LEAD_SECONDS,
  OUTCOME_NO,
  OUTCOME_YES,
} from './constants'

export type BuyQuote = { shares: bigint; fee: bigint; net: bigint; poolBought: bigint; poolOther: bigint }
export type SellQuote = { gross: bigint; fee: bigint; out: bigint; poolSold: bigint; poolOther: bigint }

export function feeOf(amount: bigint, feeBps: bigint) {
  return (amount * feeBps) / BPS
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator
  return numerator % denominator === 0n ? quotient : quotient + 1n
}

export function isqrt(value: bigint) {
  if (value < 2n) return value
  let x = 1n << BigInt(Math.ceil(value.toString(2).length / 2))
  for (;;) {
    const y = (x + value / x) / 2n
    if (y >= x) return x
    x = y
  }
}

export function quoteBuy(poolBought: bigint, poolOther: bigint, gross: bigint, feeBps: bigint): BuyQuote | null {
  if (poolBought <= 0n || poolOther <= 0n || gross <= 0n) return null
  const fee = feeOf(gross, feeBps)
  const net = gross - fee
  if (net <= 0n) return null
  const k = poolBought * poolOther
  const boughtAfterMint = poolBought + net
  const otherAfter = poolOther + net
  const kept = ceilDiv(k, otherAfter)
  const shares = boughtAfterMint - kept
  if (shares <= 0n) return null
  return { shares, fee, net, poolBought: kept, poolOther: otherAfter }
}

export function quoteSell(poolSold: bigint, poolOther: bigint, shares: bigint, feeBps: bigint): SellQuote | null {
  if (poolSold <= 0n || poolOther <= 0n || shares <= 0n) return null
  const k = poolSold * poolOther
  const xs = poolSold + shares
  const sum = xs + poolOther
  const discriminant = sum * sum - 4n * shares * poolOther
  let r = (sum - isqrt(discriminant)) / 2n
  while (r > 0n && (r >= xs || r >= poolOther || (xs - r) * (poolOther - r) < k)) r -= 1n
  if (r <= 0n) return null
  const fee = feeOf(r, feeBps)
  const out = r - fee
  if (out <= 0n) return null
  return { gross: r, fee, out, poolSold: xs - r, poolOther: poolOther - r }
}

export function yesPriceBps(yesPool: bigint, noPool: bigint) {
  const total = yesPool + noPool
  if (total === 0n) return BPS / 2n
  return (noPool * BPS) / total
}

/** YES probability 0..1 from pools. */
export function yesProbability(yesPool: bigint, noPool: bigint) {
  return Number(yesPriceBps(yesPool, noPool)) / Number(BPS)
}

export function resolveOutcome(strike: bigint, close: bigint) {
  return close >= strike ? OUTCOME_YES : OUTCOME_NO
}

export type PositionLike = {
  yesShares: bigint
  noShares: bigint
  cost: bigint
  proceeds: bigint
  maxBpm: number
  heartSamples: number
  ability: number
}

export type SlotSettlement = { payout: bigint; profit: bigint; bonus: bigint; calm: boolean; cheers: boolean }

export function isCalm(position: PositionLike) {
  return position.heartSamples > 0 && position.maxBpm >= HEART_BPM_MIN && position.maxBpm < CALM_BPM_LIMIT
}

export function settleSlot(position: PositionLike, outcome: number): SlotSettlement {
  const payout = outcome === OUTCOME_YES ? position.yesShares : position.noShares
  const profit = payout + position.proceeds - position.cost
  const won = profit > 0n
  const lost = profit < 0n
  const calm = won && isCalm(position)
  let bonus = 0n
  if (position.ability === ABILITY_DOUBLE && won) bonus = profit < ABILITY_CAP ? profit : ABILITY_CAP
  else if (position.ability === ABILITY_PROTECT && lost) bonus = -profit < ABILITY_CAP ? -profit : ABILITY_CAP
  else if (position.ability === ABILITY_CALM && calm) bonus = ABILITY_CAP
  return { payout, profit, bonus, calm, cheers: position.ability === ABILITY_CHEERS && won }
}

/** Mark-to-market value of a position at the current YES probability (for live PnL). */
export function markValue(position: PositionLike, yesProb: number) {
  return Number(position.yesShares) * yesProb + Number(position.noShares) * (1 - yesProb)
}

export function nextRoundEnd(now: number, roundSeconds: number) {
  let end = (Math.floor(now / roundSeconds) + 1) * roundSeconds
  if (end - now < MIN_ROUND_LEAD_SECONDS) end += roundSeconds
  return end
}

/** Applies a slippage tolerance (percent) to a quoted amount, rounding down. */
export function withSlippage(amount: bigint, slippagePercent: number) {
  const keepBps = BigInt(Math.max(0, Math.round((100 - slippagePercent) * 100)))
  return (amount * keepBps) / BPS
}

export function usdToChips(usd: number) {
  if (!Number.isFinite(usd) || usd < 0) throw new Error('Amount must be a positive number')
  return BigInt(Math.round(usd * 1_000_000))
}

export function chipsToUsd(chips: bigint | number) {
  return Number(chips) / 1_000_000
}
