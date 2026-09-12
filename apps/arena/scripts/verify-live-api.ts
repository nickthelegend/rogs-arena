/**
 * Live HTTP checks against the deployed arena service: auth, profile, faucet, errors
 * (TEST-PLAN API-07..10, API-12). Real ed25519 signatures, real devnet SOL. No mocks.
 *
 * The probe wallet is new each run. Its user, nonce, session and faucet documents are
 * removed from Mongo at the end so the demo database only holds real players.
 *
 * Usage (from apps/arena, which loads .env): bun scripts/verify-live-api.ts [serviceUrl]
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { MongoClient } from 'mongodb'
import nacl from 'tweetnacl'

const base = process.argv[2] ?? 'https://arena-production-0bdd.up.railway.app'
const rpc = new Connection(process.env.BASE_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed')
const faucetKey = new PublicKey('5Ssi6m56mzksijwkzVrHxGFom2vnP7YZPXagYD9nYWBV')

let failures = 0
function check(id: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`)
}

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.token) headers.authorization = `Bearer ${init.token}`
  const res = await fetch(base + path, { ...init, headers })
  const text = await res.text()
  let body: any = text
  try {
    body = JSON.parse(text)
  } catch {}
  return { status: res.status, body, text }
}

const post = (path: string, data: unknown, token?: string) => call(path, { method: 'POST', body: JSON.stringify(data), token })
const noStack = (text: string) => !/\bat [\w.<>]+ \(|node_modules|\.ts:\d+/.test(text)

async function main() {
  const probe = Keypair.generate()
  const wallet = probe.publicKey.toBase58()
  console.log(`probe wallet ${wallet} against ${base}`)

  // API-07
  const bad = await post('/api/auth/nonce', { wallet: 'not-a-wallet' })
  check('API-07', bad.status === 400 && bad.body?.error === 'wallet: Invalid wallet address', `${bad.status} ${bad.text}`)

  // API-08
  const nonce = await post('/api/auth/nonce', { wallet })
  const expected = `Rogs Arena sign-in\nwallet: ${wallet}\nnonce: `
  check('API-08 nonce', nonce.status === 200 && String(nonce.body?.message).startsWith(expected), `${nonce.status} message format ok`)
  const sign = (message: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), probe.secretKey))
  const forged = await post('/api/auth/verify', { wallet, signature: sign(`${nonce.body.message}x`) })
  check('API-08 bad signature', forged.status === 401, `${forged.status} ${forged.text}`)
  const signature = sign(nonce.body.message)
  const verified = await post('/api/auth/verify', { wallet, signature })
  const token: string = verified.body?.token
  check('API-08 good signature', verified.status === 200 && typeof token === 'string' && verified.body.wallet === wallet, `${verified.status} token issued, expiresAt ${verified.body?.expiresAt}`)
  const reused = await post('/api/auth/verify', { wallet, signature })
  check('API-08 reused nonce', reused.status === 401, `${reused.status} ${reused.text}`)

  // API-09
  const anon = await post('/api/profile', { displayName: 'Probe' })
  check('API-09 no token', anon.status === 401, `${anon.status} ${anon.text}`)
  const invalid = await post('/api/profile', { displayName: '<script>' }, token)
  check('API-09 invalid name', invalid.status === 400, `${invalid.status} ${invalid.text}`)
  const name = `Probe ${wallet.slice(0, 6)}`
  const saved = await post('/api/profile', { displayName: name }, token)
  check('API-09 valid', saved.status === 200 && saved.body?.displayName === name, `${saved.status} ${saved.text}`)
  const read = await call(`/api/profile/${wallet}`)
  check('API-09 read back', read.status === 200 && read.body?.displayName === name, `${read.status} ${read.text}`)

  // API-10
  const anonFaucet = await post('/api/faucet', {})
  check('API-10 no token', anonFaucet.status === 401, `${anonFaucet.status} ${anonFaucet.text}`)
  const drip = await post('/api/faucet', {}, token)
  check('API-10 unfunded wallet', drip.status === 200 && typeof drip.body?.signature === 'string' && drip.body.lamports === 20_000_000, `${drip.status} ${drip.text}`)
  if (drip.body?.signature) {
    const tx = await rpc.getTransaction(drip.body.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    const balance = await rpc.getBalance(probe.publicKey, 'confirmed')
    check('API-10 transfer landed', !tx?.meta?.err && balance === 20_000_000, `devnet balance ${balance / LAMPORTS_PER_SOL} SOL, tx ${drip.body.signature}`)
  }
  const funded = await post('/api/faucet', {}, token)
  check('API-10 funded wallet skipped', funded.status === 200 && funded.body?.skipped === true, `${funded.status} ${funded.text}`)
  // Return most of the SOL so the wallet is below the threshold again; the per-wallet limit must now answer.
  await sendAndConfirmTransaction(rpc, new Transaction().add(SystemProgram.transfer({ fromPubkey: probe.publicKey, toPubkey: faucetKey, lamports: 15_000_000 })), [probe])
  const limited = await post('/api/faucet', {}, token)
  check('API-10 repeat within 24h', limited.status === 429, `${limited.status} ${limited.text}`)

  // API-12
  const missing = await call('/api/nosuch-route')
  check('API-12 404', missing.status === 404 && missing.body?.error === 'Not found', `${missing.status} ${missing.text}`)
  const method = await call('/api/auth/nonce')
  check('API-12 405', method.status === 405 && typeof method.body?.error === 'string', `${method.status} ${method.text}`)
  const malformed = await call('/api/auth/nonce', { method: 'POST', body: '{bad json' })
  check('API-12 malformed body', malformed.status === 400 && noStack(malformed.text), `${malformed.status} ${malformed.text}`)
  check('API-12 no stack traces', [bad, forged, reused, anon, invalid, anonFaucet, limited, missing, method, malformed].every((r) => noStack(r.text)), 'error bodies carry only an error string')

  // Remove the probe's documents; devnet SOL left in the wallet is 0.005 minus fees.
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const db = mongo.db(process.env.MONGODB_DB ?? 'rogs_arena')
  const removed = await Promise.all(['users', 'nonces', 'sessions', 'faucet'].map((name) => db.collection(name).deleteMany({ wallet })))
  console.log(`cleanup: removed ${removed.map((r) => r.deletedCount).join('/')} users/nonces/sessions/faucet docs for the probe`)
  await mongo.close()

  console.log(failures ? `LIVE API FAILED: ${failures}` : 'LIVE API PASSED')
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error('LIVE API CRASHED:', error)
  process.exit(2)
})
