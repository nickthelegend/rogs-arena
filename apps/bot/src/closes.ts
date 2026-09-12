import { closesRef } from '@/firebase'
import { closeKey } from '@repo/shared/firebase-path'
import { update } from 'firebase/database'
import { closeRecord, type PositionClose } from '@/trade/close-record'

export type { PositionClose } from '@/trade/close-record'
export { closeRecord } from '@/trade/close-record'

export async function writeClose(input: PositionClose) {
  const record = closeRecord(input)
  const key = closeKey(record.marketId, record.trader, record.outcome)
  await update(closesRef, { [key]: record })
}
