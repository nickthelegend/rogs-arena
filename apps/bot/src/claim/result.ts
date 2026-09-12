import { formatUnits } from 'viem'

export type Outcome = 'YES' | 'NO'
export type ClaimResult = 'win' | 'lose' | 'void' | 'pending'
export type Claimed = 'yes' | 'no' | 'dry' | 'fail'

export type ClaimableOutcome = {
  label: Outcome
  index: 0 | 1
  id: bigint
}

export type ClaimRow = {
  wallet: `0x${string}`
  symbol: string
  position: string
  result: ClaimResult
  claimed: Claimed
  amount: number
  pnl: number
  note?: string
}

export function claimableOutcomes({
  isVoided,
  isResolved,
  winningOutcome,
  yesId,
  noId,
}: {
  isVoided: boolean
  isResolved: boolean
  winningOutcome: number
  yesId: bigint
  noId: bigint
}): ClaimableOutcome[] {
  if (isVoided) {
    return [
      { label: 'YES', index: 0, id: yesId },
      { label: 'NO', index: 1, id: noId },
    ]
  }

  if (!isResolved) return []

  return winningOutcome === 0
    ? [{ label: 'YES', index: 0, id: yesId }]
    : [{ label: 'NO', index: 1, id: noId }]
}

export function settlementResult({
  isVoided,
  isResolved,
  winningOutcome,
  yes,
  no,
}: {
  isVoided: boolean
  isResolved: boolean
  winningOutcome: number
  yes: number
  no: number
}): ClaimResult {
  if (isVoided) return 'void'
  if (!isResolved) return 'pending'
  if (winningOutcome === 0) return yes > 0 ? 'win' : 'lose'
  return no > 0 ? 'win' : 'lose'
}

export function formatPosition(yes: number, no: number) {
  const parts = []
  if (yes > 0) parts.push(`YES ${yes.toFixed(2)}`)
  if (no > 0) parts.push(`NO ${no.toFixed(2)}`)
  return parts.length > 0 ? parts.join(' ') : '-'
}

export function humanAmount(raw: bigint, decimals: number) {
  return Number(formatUnits(raw, decimals))
}

export function formatPnl(value: number) {
  if (value === 0) return '0.00'
  const sign = value > 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)}`
}

export function formatClaimRow(row: ClaimRow) {
  const line = [
    row.wallet,
    row.symbol.padEnd(16, ' '),
    row.position.padEnd(22, ' '),
    row.result.padEnd(7, ' '),
    row.claimed.padEnd(7, ' '),
    row.amount.toFixed(2).padStart(8, ' '),
    formatPnl(row.pnl).padStart(8, ' '),
  ].join('  ')

  return row.note ? `  ${line}  ${row.note}` : `  ${line}`
}

export const claimHeader = [
  '  wallet'.padEnd(44, ' '),
  'symbol'.padEnd(16, ' '),
  'position'.padEnd(22, ' '),
  'result'.padEnd(7, ' '),
  'claimed'.padEnd(7, ' '),
  'amount'.padStart(8, ' '),
  'pnl'.padStart(8, ' '),
].join('  ')
