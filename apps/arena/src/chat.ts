import type { ChatDoc, Collections } from './db'
import type { ChatDto } from './types'

export const CHAT_INTERVAL_MS = 1_000
export const CHAT_RATE_LIMIT_ERROR = 'Slow down: 1 message per second'

export type ChatResult = { ok: true; chat: ChatDto } | { ok: false; error: string }

const queues = new Map<string, Promise<unknown>>()

// Serializes work per key so the read-then-insert rate check cannot race inside this process.
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, settled)
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return run
}

export const toChatDto = (doc: ChatDoc): ChatDto => ({
  id: doc._id ? doc._id.toHexString() : '',
  address: doc.address,
  name: doc.name,
  message: doc.message,
  t: doc.t,
})

/** Persists a chat message unless the wallet posted within the last second. */
export function postChat(
  cols: Collections,
  input: { wallet: string; name: string; message: string },
  clock: () => number = Date.now,
): Promise<ChatResult> {
  return serialize(input.wallet, async () => {
    const now = clock()
    const recent = await cols.chat.findOne({ address: input.wallet, t: { $gt: now - CHAT_INTERVAL_MS } })
    if (recent) return { ok: false, error: CHAT_RATE_LIMIT_ERROR }
    const doc: ChatDoc = { address: input.wallet, name: input.name, message: input.message, t: now }
    const { insertedId } = await cols.chat.insertOne(doc)
    return { ok: true, chat: toChatDto({ ...doc, _id: insertedId }) }
  })
}

export async function listChat(cols: Collections, limit: number): Promise<ChatDto[]> {
  const docs = await cols.chat.find({}).sort({ t: -1 }).limit(limit).toArray()
  return docs.reverse().map(toChatDto)
}
