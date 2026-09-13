import type { RoundDto } from '@/lib/arena-api'

export const HISTORY_INTERVAL_SECONDS = 5 * 60
export const HISTORY_PAGE_SIZE = 96

const historyIntervalMs = HISTORY_INTERVAL_SECONDS * 1000

export type HistoryOutcome = 'Y' | 'N'

export type HistoryRound = Pick<RoundDto, 'endTs' | 'outcome'>

/**
 * Rounds close on 5-minute boundaries, so a round belongs to the slot its end closes.
 * A late crank roll shortens the start but never moves the round into another slot.
 */
export function historySlotMs(endTs: number) {
  if (!Number.isFinite(endTs) || endTs <= 0) return null
  return Math.floor((endTs * 1000 - 1) / historyIntervalMs) * historyIntervalMs
}

export function historyOutcome(round: Pick<RoundDto, 'outcome'>): HistoryOutcome | null {
  if (round.outcome === 'YES') return 'Y'
  if (round.outcome === 'NO') return 'N'
  return null
}

export function historyOutcomes(rounds: readonly HistoryRound[]): Record<number, HistoryOutcome> {
  const outcomes: Record<number, HistoryOutcome> = {}

  for (const round of rounds) {
    const slot = historySlotMs(round.endTs)
    const outcome = historyOutcome(round)
    if (slot == null || outcome == null) continue
    outcomes[slot] = outcome
  }

  return outcomes
}
