/**
 * Rogs Demo Wallet for local end-to-end runs in the Claude Browser pane.
 *
 * A real devnet keypair exposed to http://localhost:3000 as a Wallet Standard wallet, so the app's normal
 * Connect wallet path (the same one Phantom, Solflare and Backpack use) is exercised with real signatures.
 * The secret key never leaves this process: the injected page script only knows the public key and asks this
 * server, bound to 127.0.0.1 and answering only the app origin, to sign. Every request is logged.
 *
 * Usage (from apps/arena): bun scripts/demo-wallet.ts
 * Inject into the page: const s = document.createElement('script'); s.src = 'http://127.0.0.1:8799/inject.js'; document.head.append(s)
 * The key lives in ~/.config/solana/rogs-demo-wallet.json (created on first run, never printed); the signing log is
 * written to the system temp directory.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'

const KEY_FILE = process.env.DEMO_WALLET_KEY ?? `${homedir()}/.config/solana/rogs-demo-wallet.json`
const LOG_FILE = process.env.DEMO_WALLET_LOG ?? `${tmpdir()}/rogs-demo-wallet.log`
const PORT = 8799
const APP_ORIGIN = 'http://localhost:3000'
const BASE_RPC = 'https://rpc.magicblock.app/devnet'
const FUND_TO = 0.05 * LAMPORTS_PER_SOL
const FUND_BELOW = 0.03 * LAMPORTS_PER_SOL
const PROGRAM_NAMES: Record<string, string> = {
  J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q: 'rogs-arena',
  DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh: 'magicblock-delegation',
  Magic11111111111111111111111111111111111111: 'magicblock-magic-program',
  '11111111111111111111111111111111': 'system',
  ComputeBudget111111111111111111111111111111: 'compute-budget',
}

function log(line: string) {
  const text = `${new Date().toISOString().slice(11, 19)} ${line}`
  console.log(text)
  appendFileSync(LOG_FILE, `${text}\n`)
}

function loadKeypair() {
  if (existsSync(KEY_FILE)) return Keypair.fromSecretKey(bs58.decode(JSON.parse(readFileSync(KEY_FILE, 'utf8')).secretKey))
  const keypair = Keypair.generate()
  writeFileSync(KEY_FILE, JSON.stringify({ publicKey: keypair.publicKey.toBase58(), secretKey: bs58.encode(keypair.secretKey) }), {
    mode: 0o600,
  })
  return keypair
}

const wallet = loadKeypair()
const address = wallet.publicKey.toBase58()
const connection = new Connection(BASE_RPC, 'confirmed')

async function fund() {
  const lamports = await connection.getBalance(wallet.publicKey, 'confirmed')
  if (lamports >= FUND_BELOW) return lamports
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/rogs-deployer.json`, 'utf8')) as number[]),
  )
  const transfer = SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: wallet.publicKey, lamports: FUND_TO - lamports })
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(transfer), [deployer], { commitment: 'confirmed' })
  log(`funded ${address} to 0.05 devnet SOL from the deployer (${signature})`)
  return connection.getBalance(wallet.publicKey, 'confirmed')
}

function signTransactionBytes(bytes: Uint8Array) {
  const transaction = VersionedTransaction.deserialize(bytes)
  const { message } = transaction
  const signers = message.staticAccountKeys.slice(0, message.header.numRequiredSignatures)
  const index = signers.findIndex((key) => key.equals(wallet.publicKey))
  if (index < 0) throw new Error('Rogs Demo Wallet is not a required signer of this transaction')
  transaction.signatures[index] = nacl.sign.detached(message.serialize(), wallet.secretKey)
  const programs = [
    ...new Set(message.compiledInstructions.map((instruction) => message.staticAccountKeys[instruction.programIdIndex].toBase58())),
  ].map((id) => PROGRAM_NAMES[id] ?? `${id.slice(0, 6)}…`)
  const role = index === 0 ? `fee payer, tx ${bs58.encode(transaction.signatures[0])}` : `co-signer #${index} of ${signers.length}`
  return { signed: transaction.serialize(), summary: `v=${transaction.version} programs [${programs.join(', ')}] ${role}` }
}

const icon = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#232428"/><circle cx="32" cy="34" r="20" fill="#74CC92"/><circle cx="24" cy="28" r="5" fill="#fff"/><circle cx="40" cy="28" r="5" fill="#fff"/><circle cx="24" cy="28" r="2.5" fill="#111"/><circle cx="40" cy="28" r="2.5" fill="#111"/><path d="M22 42 Q32 48 42 42" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
).toString('base64')}`

const injectScript = `(() => {
  if (window.__rogsDemoWallet) return
  const SIGNER = 'http://127.0.0.1:${PORT}'
  const ADDRESS = '${address}'
  const PUBLIC_KEY = new Uint8Array(${JSON.stringify([...wallet.publicKey.toBytes()])})
  const ICON = '${icon}'
  const CHAINS = ['solana:devnet', 'solana:testnet', 'solana:localnet', 'solana:mainnet']
  const FEATURES = ['solana:signTransaction', 'solana:signAndSendTransaction', 'solana:signMessage']
  const toBase64 = (bytes) => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text) }
  const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
  async function signer(path, body) {
    const response = await fetch(SIGNER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Rogs Demo Wallet could not sign')
    return result
  }
  const account = Object.freeze({ address: ADDRESS, publicKey: PUBLIC_KEY, chains: CHAINS, features: FEATURES, label: 'Rogs Demo Wallet', icon: ICON })
  let connected = false
  const listeners = new Set()
  const emit = () => { for (const listener of listeners) listener({ accounts: wallet.accounts }) }
  const wallet = {
    version: '1.0.0',
    name: 'Rogs Demo Wallet',
    icon: ICON,
    chains: CHAINS,
    get accounts() { return connected ? [account] : [] },
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => { connected = true; emit(); return { accounts: [account] } } },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => { connected = false; emit() } },
      'standard:events': { version: '1.0.0', on: (event, listener) => { if (event !== 'change') return () => {}; listeners.add(listener); return () => listeners.delete(listener) } },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: async (...inputs) => {
          const { signed } = await signer('/sign-transactions', { transactions: inputs.map((input) => toBase64(input.transaction)) })
          return signed.map((encoded) => ({ signedTransaction: fromBase64(encoded) }))
        },
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signAndSendTransaction: async (...inputs) => {
          const { signatures } = await signer('/sign-and-send', { transactions: inputs.map((input) => toBase64(input.transaction)) })
          return signatures.map((encoded) => ({ signature: fromBase64(encoded) }))
        },
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async (...inputs) => Promise.all(inputs.map(async (input) => {
          const { signature } = await signer('/sign-message', { message: toBase64(input.message) })
          return { signedMessage: input.message, signature: fromBase64(signature) }
        })),
      },
    },
  }
  class RegisterWalletEvent extends Event {
    #detail
    get detail() { return this.#detail }
    get type() { return 'wallet-standard:register-wallet' }
    constructor(callback) { super('wallet-standard:register-wallet', { bubbles: false, cancelable: false, composed: false }); this.#detail = callback }
  }
  const register = (api) => api.register(wallet)
  window.dispatchEvent(new RegisterWalletEvent(register))
  window.addEventListener('wallet-standard:app-ready', (event) => register(event.detail))
  window.__rogsDemoWallet = { address: ADDRESS }
  console.info('[Rogs Demo Wallet] registered ' + ADDRESS)
})()
`

const corsHeaders = {
  'access-control-allow-origin': APP_ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-private-network': 'true',
  vary: 'origin',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders } })

const lamports = await fund()
log(`Rogs Demo Wallet ${address} ready with ${lamports / LAMPORTS_PER_SOL} devnet SOL on http://127.0.0.1:${PORT}`)

Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, address, lamports: await connection.getBalance(wallet.publicKey, 'confirmed') })
    }
    if (request.method === 'GET' && url.pathname === '/inject.js') {
      return new Response(injectScript, {
        headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders },
      })
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404)
    const origin = request.headers.get('origin')
    if (origin !== APP_ORIGIN) {
      log(`refused a signing request from origin ${origin}`)
      return json({ error: `only ${APP_ORIGIN} may use Rogs Demo Wallet` }, 403)
    }
    try {
      const body = (await request.json()) as { message?: string; transactions?: string[] }
      if (url.pathname === '/sign-message' && body.message) {
        const message = Buffer.from(body.message, 'base64')
        const signature = nacl.sign.detached(message, wallet.secretKey)
        log(`signMessage "${new TextDecoder().decode(message).replace(/\s+/g, ' ').slice(0, 100)}"`)
        return json({ signature: Buffer.from(signature).toString('base64') })
      }
      if (url.pathname === '/sign-transactions' && body.transactions) {
        const signed = body.transactions.map((encoded) => {
          const result = signTransactionBytes(Buffer.from(encoded, 'base64'))
          log(`signTransaction ${result.summary}`)
          return Buffer.from(result.signed).toString('base64')
        })
        return json({ signed })
      }
      if (url.pathname === '/sign-and-send' && body.transactions) {
        const signatures: string[] = []
        for (const encoded of body.transactions) {
          const result = signTransactionBytes(Buffer.from(encoded, 'base64'))
          const signature = await connection.sendRawTransaction(result.signed)
          await connection.confirmTransaction(signature, 'confirmed')
          log(`signAndSendTransaction ${result.summary} confirmed on devnet`)
          signatures.push(Buffer.from(bs58.decode(signature)).toString('base64'))
        }
        return json({ signatures })
      }
      return json({ error: 'not found' }, 404)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`signing failed: ${message}`)
      return json({ error: message }, 400)
    }
  },
})
