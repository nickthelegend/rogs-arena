/**
 * Live WebSocket checks against the deployed arena service (TEST-PLAN WS-01, WS-04, and the
 * HTTP half of WS-03). Real ed25519 sign-in, real Mongo persistence. No mocks.
 *
 * The probe wallet's chat message, user, nonce and session documents are removed at the end.
 *
 * Usage (from apps/arena, which loads .env): bun scripts/verify-live-ws.ts [serviceUrl]
 */
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { MongoClient } from 'mongodb'
import nacl from 'tweetnacl'

const base = process.argv[2] ?? 'https://arena-production-0bdd.up.railway.app'
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`

let failures = 0
function check(id: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`)
}

type Frame = { type: string; [key: string]: any }

class Probe {
  readonly frames: Frame[] = []
  private readonly socket: WebSocket
  readonly opened: Promise<void>

  constructor(label: string) {
    this.socket = new WebSocket(wsUrl)
    this.opened = new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve()
      this.socket.onerror = () => reject(new Error(`${label}: socket error`))
    })
    this.socket.onmessage = (event) => this.frames.push(JSON.parse(String(event.data)))
  }

  send(data: unknown) {
    this.socket.send(typeof data === 'string' ? data : JSON.stringify(data))
  }

  async next(predicate: (frame: Frame) => boolean, timeoutMs = 8_000, from = 0): Promise<Frame | null> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const found = this.frames.slice(from).find(predicate)
      if (found) return found
      await Bun.sleep(50)
    }
    return null
  }

  close() {
    this.socket.close()
  }
}

const errorFrame = (text: string) => (frame: Frame) => frame.type === 'error' && String(frame.error).includes(text)

async function signIn(keypair: Keypair): Promise<string> {
  const wallet = keypair.publicKey.toBase58()
  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<any>)
  const { message } = await post('/api/auth/nonce', { wallet })
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey))
  const { token } = await post('/api/auth/verify', { wallet, signature })
  if (typeof token !== 'string') throw new Error('sign-in failed')
  return token
}

async function main() {
  // WS-01: the first frame after hello is a snapshot of the same round the HTTP API reports.
  const anon = new Probe('anon')
  await anon.opened
  anon.send({ type: 'hello', sessionId: `probe-anon-${Date.now()}` })
  const snapshot = await anon.next((frame) => frame.type === 'snapshot')
  const httpArena = (await fetch(`${base}/api/arena`).then((r) => r.json())) as any
  const wsRound = snapshot?.data?.round?.roundId
  check(
    'WS-01',
    anon.frames[0]?.type === 'snapshot' && typeof wsRound === 'number' && Math.abs(wsRound - httpArena.round.roundId) <= 1,
    `first frame ${anon.frames[0]?.type}, ws round ${wsRound}, http round ${httpArena.round.roundId}`,
  )

  // WS-04: unauthenticated chat and heart are refused.
  let mark = anon.frames.length
  anon.send({ type: 'chat', message: 'should not persist' })
  check('WS-04 unauthenticated chat', Boolean(await anon.next(errorFrame('Sign in to chat'), 8_000, mark)), 'error "Sign in to chat"')
  mark = anon.frames.length
  anon.send({ type: 'heart', bpm: 80 })
  check('WS-04 unauthenticated heart', Boolean(await anon.next(errorFrame('Sign in to share heart rate'), 8_000, mark)), 'error "Sign in to share heart rate"')
  mark = anon.frames.length
  anon.send('{not json')
  check('WS-04 invalid JSON', Boolean(await anon.next(errorFrame('Invalid JSON message'), 8_000, mark)), 'error "Invalid JSON message"')

  const early = new Probe('early')
  await early.opened
  early.send({ type: 'presence' })
  check('WS-04 message before hello', Boolean(await early.next(errorFrame('Send hello first'))), 'error "Send hello first"')
  early.close()

  // Authenticated socket: length limit, broadcast to other clients, flood limit, bpm range.
  const keypair = Keypair.generate()
  const wallet = keypair.publicKey.toBase58()
  const token = await signIn(keypair)
  const authed = new Probe('authed')
  await authed.opened
  authed.send({ type: 'hello', sessionId: `probe-auth-${Date.now()}`, token })
  await authed.next((frame) => frame.type === 'snapshot')

  mark = authed.frames.length
  authed.send({ type: 'chat', message: 'x'.repeat(281) })
  check('WS-04 too long', Boolean(await authed.next(errorFrame('Message must be 1-280 characters'), 8_000, mark)), 'error "Message must be 1-280 characters"')
  mark = authed.frames.length
  authed.send({ type: 'heart', bpm: 400 })
  check('WS-04 bpm out of range', Boolean(await authed.next(errorFrame('bpm must be between 30 and 230'), 8_000, mark)), 'error "bpm must be between 30 and 230"')

  const text = `live ws probe ${Date.now()}`
  const anonMark = anon.frames.length
  mark = authed.frames.length
  authed.send({ type: 'chat', message: text })
  authed.send({ type: 'chat', message: `${text} flood` })
  const mentions = (frame: Frame) => frame.type === 'chat' && JSON.stringify(frame).includes(text)
  const onAnon = await anon.next(mentions, 8_000, anonMark)
  const onAuthed = await authed.next(mentions, 8_000, mark)
  check('WS-03 broadcast (HTTP half)', Boolean(onAnon && onAuthed), 'chat frame reached the sender and a second client')
  check('WS-04 flood', Boolean(await authed.next(errorFrame('Slow down: 1 message per second'), 8_000, mark)), 'second message within 1s refused')
  const flooded = [...anon.frames.slice(anonMark)].some((frame) => frame.type === 'chat' && JSON.stringify(frame).includes('flood'))
  check('WS-04 flood not broadcast', !flooded, 'the refused message never reached other clients')

  await Bun.sleep(1_000)
  const history = (await fetch(`${base}/api/chat`).then((r) => r.json())) as any[]
  const mine = history.filter((entry) => entry.address === wallet)
  check('WS-04 nothing persisted from errors', mine.length === 1 && mine[0].message === text, `${mine.length} persisted message(s) for the probe`)

  anon.close()
  authed.close()

  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const db = mongo.db(process.env.MONGODB_DB ?? 'rogs_arena')
  const removed = await Promise.all([
    db.collection('chat').deleteMany({ address: wallet }),
    db.collection('users').deleteMany({ wallet }),
    db.collection('nonces').deleteMany({ wallet }),
    db.collection('sessions').deleteMany({ wallet }),
  ])
  console.log(`cleanup: removed ${removed.map((r) => r.deletedCount).join('/')} chat/users/nonces/sessions docs for the probe`)
  await mongo.close()

  console.log(failures ? `LIVE WS FAILED: ${failures}` : 'LIVE WS PASSED')
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error('LIVE WS CRASHED:', error)
  process.exit(2)
})
