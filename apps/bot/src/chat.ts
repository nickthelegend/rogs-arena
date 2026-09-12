import { chatRef } from '@/firebase'
import { sleep } from '@/lib/async'
import { displayName } from '@/traders'
import { wallets, type BotWallet } from '@/wallets'
import { get, limitToFirst, orderByKey, push, query, remove } from 'firebase/database'
import { getAvatar } from '../../web/lib/avatar'

export const CHAT_LIMIT = 50

export type ChatMessage = {
  address: `0x${string}`
  name: string
  avatar: string
  message: string
  t: number
  signature: `0x${string}`
}

const LINES = [
  'gm, we printing today?',
  'btc looking heavy into the open',
  'fading the first spike',
  'volume just died on the ask',
  'holding the down side for now',
  'who is still long here',
  'not me, already flipped',
  'wait for the next candle close',
  'this spread is criminal',
  'leaderboard is cooked already',
  'lock in, 30s left',
  'do not fade this wick',
  'ok now it is moving',
  'adding a bit more size',
  'send it',
  'gg if this holds the high',
  'size in on yes',
  'no looking cheap after that wick',
  'someone just lifted the ask',
  'I am out, too choppy',
  'this candle is disgusting',
  'fill was instant, love it',
  'need one more push',
  'watching the book, not the tape',
  'yes is getting lifted hard',
  'no bids disappearing',
  'this open is fake',
  'let it settle first',
  'too early to size up',
  'scalping the first 10s',
  'that wick was a gift',
  'sold the spike, already flat',
  'still holding a small yes',
  'flipped to no on that dump',
  'who bought the top lmao',
  'tape is speeding up',
  'book looks thin on both sides',
  'one print and this rips',
  'range bound, boring',
  'break the high and I chase',
  'lose 20 and I fade',
  'this is a trap open',
  'funding energy is weird today',
  'btc dumping, no should print',
  'btc ripping, yes is free',
  'do not fade the open drive',
  'already up, locking some',
  'adding on the dip, not the rip',
  'my fill was so bad',
  'got faded instantly',
  'ok that bounce is real',
  'second test of the low',
  'higher low, I am back in yes',
  'lower high, staying no',
  'this is just noise',
  'wait for a clean break',
  'liquidity is gone',
  'someone is leaning on the bid',
  'ask is getting stacked',
  'they are defending 50',
  '50 is a magnet again',
  'through 60 this runs',
  'lose 40 and it is over',
  'last 20s always cook me',
  'not touching the close',
  'closing early, I am done',
  'one more lot then I stop',
  'size is too big for this chop',
  'tiny size, just gambling',
  'this is not a trade, it is a coin flip',
  'edge is gone after that wick',
  'volatility just woke up',
  'dead tape, sitting out',
  'need a sweep then reverse',
  'stop hunt then send',
  'they swept the lows, now yes',
  'they swept the highs, now no',
  'classic fake break',
  'this time it might hold',
  'I do not trust this bounce',
  'looks heavy into the close',
  'looks like it wants higher',
  'momentum is on yes',
  'momentum died on no',
  'who is still fading this',
  'respect the trend for once',
  'mean reversion is working today',
  'trend day, do not be a hero',
  'caught the middle, annoying',
  'perfect entry, terrible hold',
  'should have taken the first 10c',
  'greed got me again',
  'took the scalp, no regrets',
  'runner still on, let it work',
  'stopped out by one tick',
  'fill then immediately red',
  'green to red in 3 seconds',
  'this market is so mean',
  'love the speed though',
  'latency feels better today',
  'my click missed the bid',
  'fat fingered a yes, send it anyway',
  'accidental no, now I am biased',
  'talking myself into yes',
  'talking myself out of no',
  'chart says up, tape says fade',
  'ignore the candles, watch flow',
  'delta flipping positive',
  'aggressive sells hitting',
  'absorbers on the ask',
  'iceberg sitting at 55',
  'that size is not real',
  'spoofed then pulled',
  'clean book now, easier',
  'spread just blew out',
  'tight spread, loading',
  'paying the ask, I want in',
  'joining the bid, no chase',
  'missed it, not chasing',
  'chased and got smoked',
  'next pullback I am in',
  'if it retests I fade',
  'break and retest then size',
  'first red candle and I am out',
]

export type SimulateChatOptions = {
  count?: number
  intervalMs?: number
  dryRun?: boolean
  signal?: AbortSignal
}

function pick<T>(items: readonly T[]) {
  const item = items[Math.floor(Math.random() * items.length)]
  if (item === undefined) throw new Error('Cannot pick from an empty list')
  return item
}

export async function buildChatMessage(wallet: BotWallet, text = pick(LINES)): Promise<ChatMessage> {
  const t = Date.now()
  const signature = await wallet.account.signMessage({
    message: `${t}:${text}`,
  })

  return {
    address: wallet.address,
    name: displayName(wallet),
    avatar: getAvatar(wallet.address),
    message: text,
    t,
    signature,
  }
}

export async function trimChat(limit = CHAT_LIMIT) {
  const snapshot = await get(chatRef)
  const overflow = snapshot.size - limit
  if (overflow <= 0) return 0

  const oldest = await get(query(chatRef, orderByKey(), limitToFirst(overflow)))
  const removals: Promise<void>[] = []
  oldest.forEach((child) => {
    removals.push(remove(child.ref))
  })
  await Promise.all(removals)
  return overflow
}

export async function publishChat(message: ChatMessage) {
  const entry = await push(chatRef, message)
  const removed = await trimChat()
  return { key: entry.key, removed }
}

export async function simulateChat({
  count,
  intervalMs = 1_500,
  dryRun = false,
  signal,
}: SimulateChatOptions = {}) {
  const roster = wallets()
  if (roster.length === 0) {
    throw new Error('No generated wallets. Run `bun run generate-wallets` first.')
  }

  let sent = 0

  while (count === undefined || sent < count) {
    if (signal?.aborted) break

    const wallet = pick(roster)
    const payload = await buildChatMessage(wallet)

    if (dryRun) {
      console.log(`  dry  ${payload.name}  ${payload.address}  ${payload.message}`)
    } else {
      const { key, removed } = await publishChat(payload)
      console.log(
        `  ${payload.name.padEnd(4, ' ')}  ${payload.address}  ${payload.message}${removed ? `  trimmed ${removed}` : ''}${key ? `  ${key}` : ''}`,
      )
    }

    sent += 1
    if (count !== undefined && sent >= count) break

    const wait = intervalMs + Math.floor(Math.random() * intervalMs)
    await sleep(wait, signal)
  }

  return sent
}
