/**
 * Live arena activity for demos: a handful of clearly named bot wallets ("Rogbot …") that use the product exactly like
 * players do. Everything is real: each bot has its own devnet wallet, delegated Player, Gum session key and arena
 * sign-in; trades, ability cards and exits are signed transactions on the MagicBlock ER; chat goes through the arena
 * WebSocket and is persisted by the service. Nothing is written to the database directly.
 *
 * Usage (from apps/arena): bun scripts/demo-activity.ts [minutes=45] [serviceUrl]
 * Bot keys are kept in the session scratchpad (never printed) so later runs reuse the same players.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, type PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import {
  ABILITY_CALM,
  ABILITY_CHEERS,
  ABILITY_DOUBLE,
  ABILITY_LOCK_SECONDS,
  ABILITY_PROTECT,
  ArenaInstructions,
  DEVNET_ENDPOINTS,
  FAUCET_MAX_BALANCE,
  MARKETS,
  OUTCOME_NO,
  OUTCOME_YES,
  PROGRAM_ID,
  ROUND_OPEN,
  TRADE_LOCK_SECONDS,
  USD,
  createConnections,
  createSessionKey,
  ensurePlayerDelegated,
  fetchArena,
  fetchPlayer,
  keypairSigner,
  marketOfRound,
  positionForRound,
  quoteBuy,
  quoteSell,
  sendBaseTransaction,
  sendErTransaction,
  withSlippage,
  type ArenaState,
  type OutcomeCode,
  type PlayerState,
  type SessionKey,
} from '@rogs/arena-sdk'

const minutes = Number(process.argv[2] ?? 45)
const API = (process.argv[3] ?? 'https://arena-production-0bdd.up.railway.app').replace(/\/$/, '')
const WS_URL = `${API.replace(/^http/, 'ws')}/ws`
// Beside the other keypairs, so the same bot players survive reboots (a temp directory was cleared once).
const KEY_FILE = process.env.DEMO_BOTS_KEY ?? `${homedir()}/.config/solana/rogs-demo-bots.json`
const BOT_NAMES = ['Rogbot Kestrel', 'Rogbot Marlin', 'Rogbot Ember', 'Rogbot Quill', 'Rogbot Nova']
const MIN_LAMPORTS = 0.015 * LAMPORTS_PER_SOL
const TOP_UP_LAMPORTS = 0.03 * LAMPORTS_PER_SOL
/** Bots trade at the same moments, so allow 1% between quote and execution, like a normal UI slippage setting. */
const SLIPPAGE_BPS = 100
/** The arena protocol expects a presence frame every 15 s to count a wallet as online. */
const PRESENCE_MS = 15_000
/** Busy coins get more flow so the default BTC view and the showcased SOL/ETH views are lively. */
const MARKET_WEIGHTS: Record<string, number> = { BTC: 5, SOL: 4, ETH: 3, BNB: 1, XRP: 1, DOGE: 1, SUI: 1, AVAX: 1, LINK: 1 }
const CHAT_LINES = [
  'gm arena, rolling into the next BTC round',
  'SOL strike looks soft, going UP',
  'double price card on this one, feeling it',
  'who else is short ETH this round?',
  'took profit early, the AMM moved fast',
  'calm pulse gang, heart rate under 120',
  'stop loss hit, back in next round',
  'cheers to whoever is holding DOGE',
  'the crank rolled right on time again',
  'settled in under two seconds, love the rollup',
  'LINK round is quiet, easy entry',
  'protect loss saved me that time',
  'watching the board freeze at resolution',
  'nine coins live and every trade is on the ER',
]

const connections = createConnections(DEVNET_ENDPOINTS)
const instructions = new ArenaInstructions(connections.base)
const now = () => Math.floor(Date.now() / 1000)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]
const stamp = () => new Date().toISOString().slice(11, 19)
const log = (bot: string, message: string) => console.log(`${stamp()} [${bot}] ${message}`)
const short = (signature: string) => `${signature.slice(0, 10)}…`
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 160)

type Bot = {
  name: string
  keypair: Keypair
  session: SessionKey | null
  token: string | null
  socket: WebSocket | null
  refreshing: boolean
  pendingExit: { market: number; roundId: number; outcome: OutcomeCode; at: number } | null
}

function loadDeployer() {
  const raw = readFileSync(`${homedir()}/.config/solana/rogs-deployer.json`, 'utf8')
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]))
}

function loadBots(): Bot[] {
  const stored: Record<string, string> = existsSync(KEY_FILE) ? JSON.parse(readFileSync(KEY_FILE, 'utf8')) : {}
  const bots = BOT_NAMES.map((name) => {
    const keypair = stored[name] ? Keypair.fromSecretKey(bs58.decode(stored[name])) : Keypair.generate()
    stored[name] = bs58.encode(keypair.secretKey)
    return { name, keypair, session: null, token: null, socket: null, refreshing: false, pendingExit: null } satisfies Bot
  })
  writeFileSync(KEY_FILE, JSON.stringify(stored), { mode: 0o600 })
  return bots
}

async function api(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${path} ${response.status}: ${body?.error ?? text}`)
  return body
}

async function signIn(bot: Bot) {
  const wallet = bot.keypair.publicKey.toBase58()
  const nonce = await api('/api/auth/nonce', { body: { wallet } })
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(nonce.message), bot.keypair.secretKey))
  const verified = await api('/api/auth/verify', { body: { wallet, signature } })
  bot.token = verified.token as string
  await api('/api/profile', { body: { displayName: bot.name }, token: bot.token })
}

function openChat(bot: Bot) {
  const socket = new WebSocket(WS_URL)
  let presence: ReturnType<typeof setInterval> | null = null
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'hello', sessionId: `demo-${bot.name}-${Date.now()}`, token: bot.token, market: 'BTC' }))
    presence = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'presence' }))
    }, PRESENCE_MS)
  }
  socket.onmessage = (event) => {
    const frame = JSON.parse(String(event.data))
    if (frame.type !== 'error') return
    log(bot.name, `chat error frame: ${frame.error}`)
    // A socket that reconnected with an expired sign-in is anonymous: sign in again and reopen.
    if (/sign in/i.test(String(frame.error))) void refreshChat(bot)
  }
  socket.onclose = () => {
    if (presence) clearInterval(presence)
    if (bot.socket !== socket) return
    bot.socket = null
    // Reconnect after a service restart so the bot stays online in the traders list, with a fresh sign-in.
    setTimeout(() => {
      if (!bot.socket) void refreshChat(bot)
    }, 5_000)
  }
  bot.socket = socket
}

async function refreshChat(bot: Bot) {
  if (bot.refreshing) return
  bot.refreshing = true
  try {
    await signIn(bot)
    const previous = bot.socket
    openChat(bot)
    previous?.close()
    log(bot.name, 'signed in again and reopened chat')
  } catch (error) {
    log(bot.name, `chat sign-in failed: ${describe(error)}`)
  } finally {
    bot.refreshing = false
  }
}

async function setUp(bot: Bot, deployer: Keypair) {
  const owner = bot.keypair.publicKey
  const lamports = await connections.base.getBalance(owner, 'confirmed')
  if (lamports < MIN_LAMPORTS) {
    const sent = await sendBaseTransaction(
      connections.base,
      [SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner, lamports: TOP_UP_LAMPORTS - lamports })],
      keypairSigner(deployer),
    )
    log(bot.name, `funded to 0.03 SOL (${short(sent.signature)})`)
  }
  const { player } = await ensurePlayerDelegated(connections, instructions, keypairSigner(bot.keypair))
  bot.session = await createSessionKey(connections, instructions, keypairSigner(bot.keypair), 6)
  if (!player?.joined) {
    const claim = await sendErTransaction(
      connections.er,
      [await instructions.claimChips(bot.session.keypair.publicKey, owner, bot.session.token)],
      bot.session.keypair,
    )
    log(bot.name, `claimed starting chips on the ER (${short(claim.signature)})`)
  }
  await signIn(bot)
  openChat(bot)
  log(bot.name, `ready as ${owner.toBase58().slice(0, 4)}…${owner.toBase58().slice(-4)}`)
}

function weightedMarket() {
  const pool = MARKETS.flatMap((market) => Array.from({ length: MARKET_WEIGHTS[market.symbol] ?? 1 }, () => market))
  return pick(pool)
}

async function settleFinished(bot: Bot, player: PlayerState, arenas: Map<number, ArenaState>) {
  const owner = bot.keypair.publicKey
  for (const position of player.positions.filter((slot) => slot.active)) {
    const market = marketOfRound(position.roundId)
    const arena = arenas.get(market)
    if (!arena || arena.current.id === position.roundId) continue
    const sent = await sendErTransaction(connections.er, [await instructions.settlePlayer(owner, market)], bot.session!.keypair)
    log(bot.name, `settled a finished ${MARKETS[market].symbol} position (${short(sent.signature)})`)
  }
}

async function trade(bot: Bot, arenas: Map<number, ArenaState>) {
  const owner = bot.keypair.publicKey
  const session = bot.session!
  let player = await fetchPlayer(connections.er, owner, PROGRAM_ID)
  if (!player) return
  await settleFinished(bot, player, arenas)
  player = (await fetchPlayer(connections.er, owner, PROGRAM_ID)) ?? player

  if (player.balance < FAUCET_MAX_BALANCE && now() - player.lastFaucetTs > 3_600) {
    const claim = await sendErTransaction(connections.er, [await instructions.claimChips(session.keypair.publicKey, owner, session.token)], session.keypair)
    log(bot.name, `topped up chips from the on-chain faucet (${short(claim.signature)})`)
    player = (await fetchPlayer(connections.er, owner, PROGRAM_ID)) ?? player
  }

  // Exit part of an open position so the closes feed and TP/SL labels have real data.
  const exit = bot.pendingExit
  if (exit && now() >= exit.at) {
    bot.pendingExit = null
    const arena = arenas.get(exit.market)
    const position = positionForRound(player, exit.roundId)
    if (arena && position && arena.current.id === exit.roundId && arena.current.endTs - now() > TRADE_LOCK_SECONDS + 3) {
      const held = exit.outcome === OUTCOME_YES ? position.yesShares : position.noShares
      const shares = held / 2n
      if (shares > 0n) {
        const [inPool, outPool] = exit.outcome === OUTCOME_YES ? [arena.current.yesPool, arena.current.noPool] : [arena.current.noPool, arena.current.yesPool]
        const quote = quoteSell(inPool, outPool, shares, arena.feeBps)
        if (quote) {
          const sent = await sendErTransaction(
            connections.er,
            [await instructions.sell(session.keypair.publicKey, owner, exit.outcome, shares, withSlippage(quote.out, SLIPPAGE_BPS), session.token, exit.market)],
            session.keypair,
          )
          log(bot.name, `sold half of ${MARKETS[exit.market].symbol} ${exit.outcome === OUTCOME_YES ? 'UP' : 'DOWN'} for $${(Number(quote.out) / 1e6).toFixed(2)} (${short(sent.signature)})`)
        }
      }
    }
    return
  }

  const openSlots = player.positions.filter((slot) => !slot.active).length
  if (openSlots === 0 || player.balance < 5n * USD) return
  const market = weightedMarket()
  const arena = arenas.get(market.id)
  if (!arena || arena.current.status !== ROUND_OPEN) return
  const left = arena.current.endTs - now()
  if (left <= ABILITY_LOCK_SECONDS + 10 || positionForRound(player, arena.current.id)) return

  const outcome: OutcomeCode = Math.random() < 0.5 ? OUTCOME_YES : OUTCOME_NO
  const amount = BigInt(3 + Math.floor(Math.random() * 10)) * USD
  const [boughtPool, otherPool] = outcome === OUTCOME_YES ? [arena.current.yesPool, arena.current.noPool] : [arena.current.noPool, arena.current.yesPool]
  const quote = quoteBuy(boughtPool, otherPool, amount, arena.feeBps)
  if (!quote) return
  const ability = Math.random() < 0.35 ? pick([ABILITY_DOUBLE, ABILITY_PROTECT, ABILITY_CALM, ABILITY_CHEERS]) : 0
  const sent = await sendErTransaction(
    connections.er,
    [await instructions.buy(session.keypair.publicKey, owner, outcome, amount, withSlippage(quote.shares, SLIPPAGE_BPS), ability, session.token, market.id)],
    session.keypair,
  )
  const card = ['', ' with Double price', ' with Protect loss', ' with Calm pulse', ' with Cheers'][ability]
  log(bot.name, `bought $${Number(amount / USD)} ${market.symbol} ${outcome === OUTCOME_YES ? 'UP' : 'DOWN'}${card} (${short(sent.signature)})`)
  if (Math.random() < 0.45) bot.pendingExit = { market: market.id, roundId: arena.current.id, outcome, at: now() + 40 + Math.floor(Math.random() * 90) }
}

async function readArenas() {
  const arenas = new Map<number, ArenaState>()
  const results = await Promise.allSettled(MARKETS.map((market) => fetchArena(connections.er, PROGRAM_ID, market.id)))
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') arenas.set(MARKETS[index].id, result.value)
  })
  return arenas
}

async function main() {
  const deployer = loadDeployer()
  const bots = loadBots()
  for (const bot of bots) {
    try {
      await setUp(bot, deployer)
    } catch (error) {
      log(bot.name, `setup failed: ${describe(error)}`)
    }
  }
  const active = bots.filter((bot) => bot.session && bot.token)
  if (active.length === 0) throw new Error('no bot finished setup')

  const deadline = Date.now() + minutes * 60_000
  let chatIndex = 0
  let nextChatAt = Date.now() + 5_000
  let stopping = false
  process.on('SIGINT', () => {
    stopping = true
  })

  while (!stopping && Date.now() < deadline) {
    const arenas = await readArenas()
    for (const bot of active) {
      try {
        await trade(bot, arenas)
      } catch (error) {
        log(bot.name, `trade skipped: ${describe(error)}`)
      }
      await sleep(1_500 + Math.floor(Math.random() * 2_500))
    }
    if (Date.now() >= nextChatAt) {
      const speaker = active[chatIndex % active.length]
      if (speaker.socket?.readyState === WebSocket.OPEN) {
        speaker.socket.send(JSON.stringify({ type: 'chat', message: CHAT_LINES[chatIndex % CHAT_LINES.length] }))
        log(speaker.name, `chat: ${CHAT_LINES[chatIndex % CHAT_LINES.length]}`)
      } else if (speaker.token) {
        openChat(speaker)
      }
      chatIndex += 1
      nextChatAt = Date.now() + 25_000 + Math.floor(Math.random() * 35_000)
    }
    await sleep(4_000)
  }

  for (const bot of active) bot.socket?.close()
  console.log(`${stamp()} demo activity finished`)
  process.exit(0)
}

main().catch((error) => {
  console.error(`demo activity failed: ${describe(error)}`)
  process.exit(1)
})
