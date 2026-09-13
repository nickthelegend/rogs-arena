export const ROUND_IDLE = 0
export const ROUND_OPEN = 1
export const ROUND_RESOLVED = 2

const STATUS_LABELS = ['idle', 'open', 'resolved'] as const

export const roundStatusLabel = (status: number): string => STATUS_LABELS[status] ?? 'unknown'

export const VRF_EPHEMERAL_QUEUE = '5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'
/** Fair Cheers: the program requires every recent trader except the winner (RECENT_TRADERS - 1). */
export const MAX_CHEERS_CANDIDATES = 15
export const CHEERS_TIMEOUT_SECONDS = 120
