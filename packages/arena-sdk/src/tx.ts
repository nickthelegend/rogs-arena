import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor'
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js'

import { accountLayer, fetchPlayer, type PlayerState } from './accounts'
import { waitForDelegation, type ArenaConnections } from './connections'
import { PROGRAM_ID, VRF_EPHEMERAL_QUEUE, marketById, type OutcomeCode } from './constants'
import { ArenaTxError, describeLogs } from './errors'
import { arenaPda, badgeRecordPda, playerPda, sessionTokenPda } from './pda'
import arenaIdl from './idl/rogs_arena.json'
import sessionIdl from './idl/gpl_session.json'

/** Anything that can sign a legacy transaction: wallet-adapter wallets, guest wallets, keypairs. */
export type WalletSigner = {
  publicKey: PublicKey
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>
}

export function keypairSigner(keypair: Keypair): WalletSigner {
  return {
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T) {
      if (transaction instanceof VersionedTransaction) transaction.sign([keypair])
      else transaction.partialSign(keypair)
      return transaction
    },
  }
}

function readOnlyProvider(connection: Connection) {
  const wallet = {
    publicKey: PublicKey.default,
    signTransaction: async () => {
      throw new Error('read-only provider cannot sign')
    },
    signAllTransactions: async () => {
      throw new Error('read-only provider cannot sign')
    },
  }
  return new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' })
}

export type InitializeArenaArgs = {
  oracleFeed: PublicKey
  keeper: PublicKey
  roundSeconds: number
  liquidity: bigint
  feeBps: number
  treasurySeed: bigint
}

const bn = (value: bigint | number) => new BN(value.toString())

export type ConfirmedTx = { signature: string; ms: number }

/** Builds rogs_arena and Gum session instructions. */
export class ArenaInstructions {
  readonly program: Program
  readonly sessionProgram: Program

  constructor(
    connection: Connection,
    readonly programId: PublicKey = PROGRAM_ID,
  ) {
    const provider = readOnlyProvider(connection)
    this.program = new Program({ ...(arenaIdl as Idl), address: programId.toBase58() }, provider)
    this.sessionProgram = new Program(sessionIdl as Idl, provider)
  }

  private get methods() {
    return this.program.methods as any
  }

  initializeArena(authority: PublicKey, args: InitializeArenaArgs) {
    return this.methods
      .initializeArena({
        oracleFeed: args.oracleFeed,
        keeper: args.keeper,
        roundSeconds: bn(args.roundSeconds),
        liquidity: bn(args.liquidity),
        feeBps: bn(args.feeBps),
        treasurySeed: bn(args.treasurySeed),
      })
      .accountsPartial({ authority, arena: arenaPda(this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  delegateArena(authority: PublicKey, validator: PublicKey) {
    return this.methods
      .delegateArena()
      .accountsPartial({ authority, arena: arenaPda(this.programId) })
      .remainingAccounts([{ pubkey: validator, isSigner: false, isWritable: false }])
      .instruction() as Promise<TransactionInstruction>
  }

  /** Opens coin market `market` (1..); signed by the market 0 arena authority. */
  initializeMarket(authority: PublicKey, market: number, args: InitializeArenaArgs) {
    return this.methods
      .initializeMarket(market, {
        oracleFeed: args.oracleFeed,
        keeper: args.keeper,
        roundSeconds: bn(args.roundSeconds),
        liquidity: bn(args.liquidity),
        feeBps: bn(args.feeBps),
        treasurySeed: bn(args.treasurySeed),
      })
      .accountsPartial({ authority, rootArena: arenaPda(this.programId), arena: arenaPda(this.programId, market) })
      .instruction() as Promise<TransactionInstruction>
  }

  delegateMarket(authority: PublicKey, market: number, validator: PublicKey) {
    return this.methods
      .delegateMarket(market)
      .accountsPartial({ authority, arena: arenaPda(this.programId, market) })
      .remainingAccounts([{ pubkey: validator, isSigner: false, isWritable: false }])
      .instruction() as Promise<TransactionInstruction>
  }

  initPlayer(owner: PublicKey) {
    return this.methods
      .initPlayer()
      .accountsPartial({ owner, player: playerPda(owner, this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  delegatePlayer(owner: PublicKey, validator: PublicKey) {
    return this.methods
      .delegatePlayer()
      .accountsPartial({ owner, player: playerPda(owner, this.programId) })
      .remainingAccounts([{ pubkey: validator, isSigner: false, isWritable: false }])
      .instruction() as Promise<TransactionInstruction>
  }

  /** Gum SessionTokenV2 scoped to this program; the session signer must also sign. */
  createSession(authority: PublicKey, sessionSigner: PublicKey, validUntil: number) {
    return (this.sessionProgram.methods as any)
      .createSessionV2(false, bn(validUntil), null)
      .accountsPartial({
        sessionToken: sessionTokenPda(sessionSigner, authority, this.programId),
        sessionSigner,
        feePayer: authority,
        authority,
        targetProgram: this.programId,
      })
      .instruction() as Promise<TransactionInstruction>
  }

  private playerAction(method: string, args: unknown[], signer: PublicKey, owner: PublicKey, sessionToken: PublicKey | null, market: number) {
    return this.methods[method](...args)
      .accountsPartial({
        signer,
        arena: arenaPda(this.programId, market),
        player: playerPda(owner, this.programId),
        sessionToken,
      })
      .instruction() as Promise<TransactionInstruction>
  }

  claimChips(signer: PublicKey, owner: PublicKey, sessionToken: PublicKey | null, market = 0) {
    return this.playerAction('claimChips', [], signer, owner, sessionToken, market)
  }

  buy(signer: PublicKey, owner: PublicKey, outcome: OutcomeCode, amount: bigint, minShares: bigint, ability: number, sessionToken: PublicKey | null, market = 0) {
    return this.playerAction('buy', [outcome, bn(amount), bn(minShares), ability], signer, owner, sessionToken, market)
  }

  sell(signer: PublicKey, owner: PublicKey, outcome: OutcomeCode, shares: bigint, minOut: bigint, sessionToken: PublicKey | null, market = 0) {
    return this.playerAction('sell', [outcome, bn(shares), bn(minOut)], signer, owner, sessionToken, market)
  }

  attachAbility(signer: PublicKey, owner: PublicKey, ability: number, sessionToken: PublicKey | null, market = 0) {
    return this.playerAction('attachAbility', [ability], signer, owner, sessionToken, market)
  }

  reportHeart(signer: PublicKey, owner: PublicKey, bpm: number, sessionToken: PublicKey | null, market = 0) {
    return this.playerAction('reportHeart', [bpm], signer, owner, sessionToken, market)
  }

  settlePlayer(owner: PublicKey, market = 0) {
    return this.methods
      .settlePlayer()
      .accountsPartial({ arena: arenaPda(this.programId, market), player: playerPda(owner, this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  resetCheers(owner: PublicKey) {
    return this.methods
      .resetCheers()
      .accountsPartial({ player: playerPda(owner, this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  rollRound(market = 0) {
    return this.methods
      .rollRound()
      .accountsPartial({ arena: arenaPda(this.programId, market), priceFeed: marketById(market).feed })
      .instruction() as Promise<TransactionInstruction>
  }

  requestCheers(payer: PublicKey, winnerOwner: PublicKey, candidateOwners: PublicKey[], callerSeed: Uint8Array, market = 0) {
    if (callerSeed.length !== 32) throw new Error('callerSeed must be 32 bytes')
    return this.methods
      .requestCheers(Array.from(callerSeed))
      .accountsPartial({
        payer,
        arena: arenaPda(this.programId, market),
        winner: playerPda(winnerOwner, this.programId),
        oracleQueue: VRF_EPHEMERAL_QUEUE,
      })
      .remainingAccounts(
        candidateOwners.map((owner) => ({ pubkey: playerPda(owner, this.programId), isSigner: false, isWritable: false })),
      )
      .instruction() as Promise<TransactionInstruction>
  }

  scheduleRoundCrank(authority: PublicKey, taskId: bigint, intervalMs: number, iterations: number, market = 0) {
    return this.methods
      .scheduleRoundCrank(bn(taskId), bn(intervalMs), bn(iterations))
      .accountsPartial({
        authority,
        arena: arenaPda(this.programId, market),
        priceFeed: marketById(market).feed,
        program: this.programId,
      })
      .instruction() as Promise<TransactionInstruction>
  }

  fundTreasury(authority: PublicKey, amount: bigint, market = 0) {
    return this.methods
      .fundTreasury(bn(amount))
      .accountsPartial({ authority, arena: arenaPda(this.programId, market) })
      .instruction() as Promise<TransactionInstruction>
  }

  commitArena(payer: PublicKey, market = 0) {
    return this.methods
      .commitArena()
      .accountsPartial({ payer, arena: arenaPda(this.programId, market) })
      .instruction() as Promise<TransactionInstruction>
  }

  commitPlayer(owner: PublicKey) {
    return this.methods
      .commitPlayer()
      .accountsPartial({ owner, player: playerPda(owner, this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  undelegatePlayer(owner: PublicKey) {
    return this.methods
      .undelegatePlayer()
      .accountsPartial({ owner, player: playerPda(owner, this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  /** Base layer: creates the owner's badge record. */
  initBadgeRecord(owner: PublicKey) {
    return this.methods
      .initBadgeRecord()
      .accountsPartial({ owner, badgeRecord: badgeRecordPda(owner, this.programId) })
      .instruction() as Promise<TransactionInstruction>
  }

  /** ER: commits the Player and runs record_badges on Solana as a post-commit Magic Action. Owner-signed. */
  commitPlayerBadges(owner: PublicKey) {
    return this.methods
      .commitPlayerBadges()
      .accountsPartial({
        owner,
        player: playerPda(owner, this.programId),
        badgeRecord: badgeRecordPda(owner, this.programId),
      })
      .instruction() as Promise<TransactionInstruction>
  }
}

async function failure(connection: Connection, signature: string, err: unknown): Promise<never> {
  let logs: string[] = []
  try {
    const transaction = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    logs = transaction?.meta?.logMessages ?? []
  } catch {
    // Logs are best-effort; the error below still carries the signature and raw error.
  }
  const described = describeLogs(logs)
  throw new ArenaTxError(described?.message ?? `Transaction failed: ${JSON.stringify(err)}`, {
    signature,
    logs,
    code: described?.code ?? null,
  })
}

async function confirmByPolling(connection: Connection, signature: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature])
    const status = value[0]
    if (status?.err) return failure(connection, signature, status.err)
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new ArenaTxError(`Transaction ${signature} was not confirmed within ${Math.round(timeoutMs / 1000)}s`, { signature })
}

/** Base-layer send with preflight, signed by the fee payer wallet plus optional keypairs. */
export async function sendBaseTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  feePayer: WalletSigner,
  extraSigners: Keypair[] = [],
): Promise<ConfirmedTx> {
  const started = performance.now()
  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction({ feePayer: feePayer.publicKey, recentBlockhash: blockhash })
  transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ...instructions)
  if (extraSigners.length) transaction.partialSign(...extraSigners)
  const signed = await feePayer.signTransaction(transaction)
  let signature: string
  try {
    signature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: 'confirmed' })
  } catch (error) {
    const logs = (error as { logs?: string[] }).logs
    const described = describeLogs(logs)
    throw new ArenaTxError(described?.message ?? (error instanceof Error ? error.message : String(error)), {
      logs: logs ?? [],
      code: described?.code ?? null,
    })
  }
  await confirmByPolling(connection, signature, 60_000)
  return { signature, ms: performance.now() - started }
}

/** Ephemeral-rollup send: ER blockhash, no preflight, confirmation by polling with a real error check. */
export async function sendErTransaction(
  er: Connection,
  instructions: TransactionInstruction[],
  signer: WalletSigner | Keypair,
  timeoutMs = 20_000,
): Promise<ConfirmedTx> {
  const wallet = signer instanceof Keypair ? keypairSigner(signer) : signer
  const started = performance.now()
  const { blockhash } = await er.getLatestBlockhash('confirmed')
  const transaction = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: blockhash })
  transaction.add(...instructions)
  const signed = await wallet.signTransaction(transaction)
  const signature = await er.sendRawTransaction(signed.serialize(), { skipPreflight: true })
  await confirmByPolling(er, signature, timeoutMs)
  return { signature, ms: performance.now() - started }
}

export type SessionKey = { keypair: Keypair; validUntil: number; token: PublicKey }

/** Creates a session key the program accepts for trades, heart reports and chips for `hours`. */
export async function createSessionKey(
  connections: ArenaConnections,
  instructions: ArenaInstructions,
  wallet: WalletSigner,
  hours = 24,
): Promise<SessionKey & ConfirmedTx> {
  const keypair = Keypair.generate()
  const validUntil = Math.floor(Date.now() / 1000) + Math.round(hours * 3600)
  const ix = await instructions.createSession(wallet.publicKey, keypair.publicKey, validUntil)
  const sent = await sendBaseTransaction(connections.base, [ix], wallet, [keypair])
  return { ...sent, keypair, validUntil, token: sessionTokenPda(keypair.publicKey, wallet.publicKey, instructions.programId) }
}

export type EnsurePlayerResult = { player: PlayerState | null; initSignature: string | null; delegateSignature: string | null }

/** Creates and/or delegates the wallet's Player account so it can trade on the ER. Idempotent. */
export async function ensurePlayerDelegated(
  connections: ArenaConnections,
  instructions: ArenaInstructions,
  wallet: WalletSigner,
): Promise<EnsurePlayerResult> {
  const address = playerPda(wallet.publicKey, instructions.programId)
  const layer = await accountLayer(connections.base, address, instructions.programId)
  let initSignature: string | null = null
  let delegateSignature: string | null = null
  if (layer !== 'delegated') {
    const ixs: TransactionInstruction[] = []
    if (layer === 'missing') ixs.push(await instructions.initPlayer(wallet.publicKey))
    ixs.push(await instructions.delegatePlayer(wallet.publicKey, connections.endpoints.validator))
    const sent = await sendBaseTransaction(connections.base, ixs, wallet)
    if (layer === 'missing') initSignature = sent.signature
    delegateSignature = sent.signature
    await waitForDelegation(connections, address, 60_000, instructions.programId)
  }
  const player = await fetchPlayer(connections.er, wallet.publicKey, instructions.programId)
  return { player, initSignature, delegateSignature }
}

/** Positive i64 task id derived from a label, so crank ids don't collide across apps. */
export async function crankTaskId(label: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)))
  let value = 0n
  for (let i = 0; i < 7; i++) value = (value << 8n) | BigInt(digest[i])
  return value
}
