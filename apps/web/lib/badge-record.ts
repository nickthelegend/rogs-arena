import type { BadgeRecordState } from '@rogs/arena-sdk'

/** Number of badges set in a badge bitmask. */
export function countBadges(bits: number) {
  let count = 0
  for (let rest = bits >>> 0; rest; rest &= rest - 1) count += 1
  return count
}

/** One-line summary of the owner's badge record on Solana. */
export function badgeRecordSummary(record: BadgeRecordState | null) {
  if (!record) return 'Badges not saved on Solana yet'
  const badges = countBadges(record.badges)
  const saves = record.updates === 1 ? '1 save' : `${record.updates} saves`
  return `On Solana: ${badges === 1 ? '1 badge' : `${badges} badges`} · best streak ${record.bestStreak} · ${saves}`
}
