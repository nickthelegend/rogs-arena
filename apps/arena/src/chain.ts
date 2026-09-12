import { readFileSync } from 'node:fs'
import { AnchorProvider, BorshCoder, Program, Wallet, type Idl, type IdlAccounts } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, type Signer, type Transaction } from '@solana/web3.js'
import type { RogsArena } from '../idl/rogs_arena'
import { VRF_EPHEMERAL_QUEUE as VRF_QUEUE_ADDRESS } from './constants'
import type { Env } from './env'
import { chunk, errorMessage, sleep } from './util'

export type ArenaAccount = IdlAccounts<RogsArena>['arena']
export type PlayerAccount = IdlAccounts<RogsArena>['player']
export type ParsedEvent = { name: string; data: unknown; index: number }

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

export const arenaPda = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('arena')], programId)[0]

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
  readonly arena: PublicKey
  readonly oracleFeed: PublicKey
  readonly erValidator: PublicKey
  readonly base: Connection
  readonly er: Connection
  readonly keeper: Keypair
  readonly faucet: Keypair
  readonly idl: RogsArena
  readonly program: Program<RogsArena>
  private readonly coder: BorshCoder

  constructor(env: Env) {
    this.idl = JSON.parse(readFileSync(env.IDL_PATH, 'utf8')) as RogsArena
    if (this.idl.address !== env.PROGRAM_ID) {
      throw new Error(`IDL address ${this.idl.address} does not match PROGRAM_ID ${env.PROGRAM_ID}`)
    }
    this.programId = new PublicKey(env.PROGRAM_ID)
    this.arena = arenaPda(this.programId)
    this.oracleFeed = new PublicKey(env.ORACLE_BTC_FEED)
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

  fetchArena(): Promise<ArenaAccount | null> {
    return this.program.account.arena.fetchNullable(this.arena)
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
