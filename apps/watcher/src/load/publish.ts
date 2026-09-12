import type { WatcherSnapshot } from '@/types'
import { push, remove, update } from 'firebase/database'
import { marketRef, tradesRef } from './firebase'
import { createPublisher } from './publisher'

const publisher = createPublisher({
  async pushPoint(point) {
    await push(marketRef, point)
  },
  async upsertTrades(trades) {
    await update(tradesRef, trades)
  },
  async clear() {
    await Promise.all([remove(marketRef), remove(tradesRef)])
  },
})

export function publishMarket(snapshot: WatcherSnapshot) {
  return publisher.publish(snapshot)
}
