import { readFileSync } from 'node:fs'
import { AnchorProvider, BorshCoder, Program, Wallet, type Idl, type IdlAccounts } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, type Signer, type Transaction } from '@solana/web3.js'
import type { RogsArena } from '../idl/rogs_arena'
import { VRF_EPHEMERAL_QUEUE as VRF_QUEUE_ADDRESS } from './constants'
import type { Env } from './env'
import { buildMarkets, type Market } from './markets'
import { chunk, errorMessage, sleep } from './util'

export type ArenaAccount = IdlAccounts<RogsArena>['arena']
export type PlayerAccount = IdlAccounts<RogsArena>['player']
export type ParsedEvent = { name: string; data: unknown; index: number }
/** One market's arena as read from the ER; `account` is null until that arena is bootstrapped and delegated. */
export type MarketArena = { market: Market; account: ArenaAccount | null }

export const VRF_EPHEMERAL_QUEUE = new PublicKey(VRF_QUEUE_ADDRESS)

const INVOKE_LINE = /^Program (\w+) invoke \[\d+\]$/
const EXIT_LINE = /^Program \w+ (success|failed)/
const PROGRAM_DATA = 'Program data: '

const CONFIRM_POLL_MS = 400
const ER_CONFIRM_TIMEOUT_MS = 20_000
const BASE_CONFIRM_TIMEOUT_MS = 75_000

export class ChainTxError extends Error {
  constructor(
    message: string,
    readonly signature: string | null,
    readonly logs: string[] = [],
    readonly timedOut = false,
  ) {
    super(message)
    this.name = 'ChainTxError'
  }
}

export const signatureOf = (error: unknown): string | null => (error instanceof ChainTxError ? error.signature : null)

export const playerPda = (owner: PublicKey, programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('player'), owner.toBuffer()], programId)[0]

/** Converts a raw oracle integer to a number. The oracle stores its exponent as +8 meaning 8 decimals. */
export function priceToNumber(raw: { toString(): string }, expo: number): number {
  const decimals = Math.abs(expo)
  const value = BigInt(raw.toString())
  const magnitude = value < 0n ? -value : value
  const scale = 10n ** BigInt(decimals)
  const text = decimals
    ? `${magnitude / scale}.${(magnitude % scale).toString().padStart(decimals, '0')}`
    : `${magnitude}`
  return value < 0n ? -Number(text) : Number(text)
}

export function anchorErrorLine(logs: string[]): string | null {
  return (
    logs.find(line => line.includes('AnchorError')) ??
    logs.find(line => /Error Code:|custom program error|Error:/i.test(line)) ??
    logs.find(line => / failed/.test(line)) ??
    null
  )
}

export class ArenaChain {
  readonly programId: PublicKey
  /** Every coin market in MARKETS order (index = market id). */
  readonly markets: readonly Market[]
  readonly erValidator: PublicKey
  readonly base: Connection
  readonly er: Connection
  readonly keeper: Keypair
  readonly faucet: Keypair
  readonly idl: RogsArena
  readonly program: Program<RogsArena>
  private readonly coder: BorshCoder
  private readonly marketsByArena: Map<string, Market>
  private readonly available = new Map<string, boolean>()
  private readonly mismatchLogged = new Set<string>()
  private arenaCache: { at: number; arenas: MarketArena[] } | null = null
  private arenaRead: Promise<MarketArena[]> | null = null

  constructor(env: Env) {
    this.idl = JSON.parse(readFileSync(env.IDL_PATH, 'utf8')) as RogsArena
    if (this.idl.address !== env.PROGRAM_ID) {
      throw new Error(`IDL address ${this.idl.address} does not match PROGRAM_ID ${env.PROGRAM_ID}`)
    }
    this.programId = new PublicKey(env.PROGRAM_ID)
    this.markets = buildMarkets(this.programId, new PublicKey(env.ORACLE_BTC_FEED))
    this.marketsByArena = new Map(this.markets.map(market => [market.arena.toBase58(), market]))
    this.erValidator = new PublicKey(env.ER_VALIDATOR)
    this.keeper = Keypair.fromSecretKey(env.KEEPER_SECRET_KEY)
    this.faucet = Keypair.fromSecretKey(env.FAUCET_SECRET_KEY)
    this.base = new Connection(env.BASE_RPC_URL, 'confirmed')
    this.er = new Connection(env.ER_RPC_URL, { commitment: 'confirmed', wsEndpoint: env.ER_WS_URL })
    const provider = new AnchorProvider(this.er, new Wallet(this.keeper), {
      commitment: 'confirmed',
      skipPreflight: true,
    })
    this.program = new Program<RogsArena>(this.idl, provider)
    this.coder = new BorshCoder(this.idl as Idl)
  }

  playerPda(owner: PublicKey): PublicKey {
    return playerPda(owner, this.programId)
  }

  market(symbol: string): Market {
    const market = this.markets.find(candidate => candidate.symbol === symbol)
    if (!market) throw new Error(`Unknown market ${symbol}`)
    return market
  }

  /** The market whose arena PDA appears first among a transaction's account keys. */
  marketOfAccounts(keys: readonly string[]): Market | null {
    for (const key of keys) {
      const market = this.marketsByArena.get(key)
      if (market) return market
    }
    return null
  }

  fetchArena(market: Market): Promise<ArenaAccount | null> {
    return this.program.account.arena.fetchNullable(market.arena)
  }

  /** Reads all market arenas from the ER in one getMultipleAccounts call. */
  async fetchArenas(): Promise<MarketArena[]> {
    const accounts = await this.program.account.arena.fetchMultiple(this.markets.map(market => market.arena))
    const arenas = this.markets.map((market, index): MarketArena => {
      const account = accounts[index] ?? null
      if (account && account.market !== market.id) {
        if (!this.mismatchLogged.has(market.symbol)) {
          this.mismatchLogged.add(market.symbol)
          console.warn(`[markets] ${market.symbol} arena ${market.arena.toBase58()} stores market ${account.market}; ignoring it`)
        }
        return { market, account: null }
      }
      return { market, account }
    })
    this.noteAvailability(arenas)
    this.arenaCache = { at: Date.now(), arenas }
    return arenas
  }

  /**
   * Arena reads for request handlers: reuses a read younger than `maxAgeMs` and shares one in-flight read.
   * If the ER is unreachable it returns the last successful read, and throws only when there never was one.
   */
  async readArenas(maxAgeMs: number): Promise<MarketArena[]> {
    if (this.arenaCache && Date.now() - this.arenaCache.at <= maxAgeMs) return this.arenaCache.arenas
    this.arenaRead ??= this.fetchArenas().finally(() => {
      this.arenaRead = null
    })
    try {
      return await this.arenaRead
    } catch (error) {
      if (this.arenaCache) return this.arenaCache.arenas
      throw error
    }
  }

  /** Logs which markets are live once, then only transitions, so unbootstrapped arenas do not flood the log. */
  private noteAvailability(arenas: MarketArena[]): void {
    const first = this.available.size === 0
    const changed = arenas.filter(({ market, account }) => this.available.get(market.symbol) !== (account !== null))
    for (const { market, account } of changed) this.available.set(market.symbol, account !== null)
    if (first) {
      const live = arenas.filter(arena => arena.account).map(arena => arena.market.symbol)
      const missing = arenas.filter(arena => !arena.account).map(arena => arena.market.symbol)
      console.log(
        `[markets] live on the ER: ${live.join(', ') || 'none'}; unavailable until bootstrapped (rechecked on every read): ${missing.join(', ') || 'none'}`,
      )
      return
    }
    for (const { market, account } of changed) {
      const arena = market.arena.toBase58()
      if (account) console.log(`[markets] ${market.symbol} arena ${arena} is now live on the ER`)
      else console.warn(`[markets] ${market.symbol} arena ${arena} is no longer readable on the ER; market unavailable`)
    }
  }

  fetchPlayer(owner: PublicKey): Promise<PlayerAccount | null> {
    return this.program.account.player.fetchNullable(this.playerPda(owner))
  }

  async fetchPlayers(owners: PublicKey[]): Promise<(PlayerAccount | null)[]> {
    const players: (PlayerAccount | null)[] = []
    for (const group of chunk(owners, 100)) {
      players.push(...(await this.program.account.player.fetchMultiple(group.map(owner => this.playerPda(owner)))))
    }
    return players
  }

  decodeArena(data: Buffer): ArenaAccount {
    return this.program.coder.accounts.decode<ArenaAccount>('arena', data)
  }

  /**
   * Decodes rogs_arena events from program logs; `index` is the event's position within the transaction.
   * Anchor's EventParser drops events emitted under a CPI (the VRF callback runs at depth 2) or after an
   * inner invoke returns, so this tracks the invoke stack itself and decodes `Program data:` lines whose
   * innermost running program is ours.
   */
  parseEvents(logs: string[]): ParsedEvent[] {
    const programId = this.programId.toBase58()
    const stack: string[] = []
    const events: ParsedEvent[] = []
    for (const line of logs) {
      const invoke = INVOKE_LINE.exec(line)
      if (invoke?.[1]) {
        stack.push(invoke[1])
        continue
      }
      if (EXIT_LINE.test(line)) {
        stack.pop()
        continue
      }
      if (!line.startsWith(PROGRAM_DATA) || stack[stack.length - 1] !== programId) continue
      try {
        const event = this.coder.events.decode(line.slice(PROGRAM_DATA.length))
        if (event) events.push({ name: event.name, data: event.data, index: events.length })
      } catch (error) {
        console.warn(`[chain] could not decode an event log: ${errorMessage(error)}`)
      }
    }
    return events
  }

  /** Sends to the ER with an ER blockhash, skipping preflight, and confirms by polling statuses. */
  async sendErTx(tx: Transaction, signers: Signer[]): Promise<string> {
    const [payer] = signers
    if (!payer) throw new Error('sendErTx needs a fee payer signer')
    const { blockhash } = await this.er.getLatestBlockhash('confirmed')
    tx.feePayer = payer.publicKey
    tx.recentBlockhash = blockhash
    tx.sign(...signers)
    let signature: string
    try {
      signature = await this.er.sendRawTransaction(tx.serialize(), { skipPreflight: true })
    } catch (error) {
      throw new ChainTxError(`ER rejected transaction: ${errorMessage(error)}`, null)
    }
    await this.waitForSignature(this.er, signature, ER_CONFIRM_TIMEOUT_MS, false)
    return signature
  }

  /** Sends to Solana devnet with preflight and waits for `confirmed`. */
  async sendBaseTx(tx: Transaction, signers: Signer[]): Promise<string> {
    const [payer] = signers
    if (!payer) throw new Error('sendBaseTx needs a fee payer signer')
    const { blockhash } = await this.base.getLatestBlockhash('confirmed')
    tx.feePayer = payer.publicKey
    tx.recentBlockhash = blockhash
    tx.sign(...signers)
    let signature: string
    try {
      signature = await this.base.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      })
    } catch (error) {
      const logs = (error as { logs?: string[] }).logs ?? []
      throw new ChainTxError(anchorErrorLine(logs) ?? `Transaction rejected: ${errorMessage(error)}`, null, logs)
    }
    await this.waitForSignature(this.base, signature, BASE_CONFIRM_TIMEOUT_MS, true)
    return signature
  }

  private async waitForSignature(connection: Connection, signature: string, timeoutMs: number, requireConfirmed: boolean) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const { value } = await connection.getSignatureStatuses([signature])
        const status = value[0]
        if (status?.err) {
          const logs = await this.transactionLogs(connection, signature)
          const line = anchorErrorLine(logs)
          throw new ChainTxError(line ?? `Transaction failed: ${JSON.stringify(status.err)}`, signature, logs)
        }
        const confirmed = status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized'
        // The ER executes on receipt and may only report "processed"; a present, error-free status is final there.
        if (status && (confirmed || !requireConfirmed)) return
      } catch (error) {
        if (error instanceof ChainTxError) throw error
      }
      await sleep(CONFIRM_POLL_MS)
    }
    throw new ChainTxError(`Transaction not confirmed within ${timeoutMs / 1000}s`, signature, [], true)
  }

  /** Static account keys of an ER transaction (the ER does not use lookup tables); empty if it cannot be read. */
  async transactionAccounts(signature: string): Promise<string[]> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const tx = await this.er.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
        if (tx) return tx.transaction.message.staticAccountKeys.map(key => key.toBase58())
      } catch {
        // retry below
      }
      await sleep(500)
    }
    return []
  }

  /** Arena events emitted by an ER transaction, or null when its logs cannot be read. */
  async erTransactionEvents(signature: string): Promise<ParsedEvent[] | null> {
    const logs = await this.transactionLogs(this.er, signature)
    return logs.length ? this.parseEvents(logs) : null
  }

  private async transactionLogs(connection: Connection, signature: string): Promise<string[]> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
        if (tx?.meta?.logMessages) return tx.meta.logMessages
      } catch {
        // retry below
      }
      await sleep(500)
    }
    return []
  }
}
