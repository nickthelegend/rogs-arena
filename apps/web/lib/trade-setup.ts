import { errorMessage } from '@/lib/error'
import { formatAddress, formatDecimalAmount } from '@/lib/format'
import { FAUCET_MAX_BALANCE, START_CHIPS } from '@rogs/arena-sdk'

/** Enough devnet SOL for the Player account rent, the session token rent, and base-layer fees. */
export const SOL_MIN_LAMPORTS = 10_000_000n
export const SOL_DECIMALS = 9
export const CHIPS_DECIMALS = 6

export const TRADE_SETUP_STEPS = [
  'connecting',
  'signing_in',
  'checking_balances',
  'funding_sol',
  'delegating_player',
  'creating_session',
  'claiming_chips',
  'ready',
] as const

export type TradeSetupStep = (typeof TRADE_SETUP_STEPS)[number]
export type TradeSetupPhase = TradeSetupStep | 'idle' | 'error'
export type FaucetAsset = 'SOL' | 'CHIPS'
export type WalletChoice = 'guest' | 'adapter'
export type IslandStage = 'unconnected' | 'preparing' | 'information' | 'error' | 'trading-zone' | 'wearable'
export type IslandZone = Extract<IslandStage, 'information' | 'trading-zone' | 'wearable'>

/** `sol` in lamports, `chips` in on-chain micro units (1 USD = 1_000_000). */
export type TradeSetupBalances = {
  sol: bigint
  chips: bigint
}

export type TradeSetupStatus = {
  step: TradeSetupPhase
  title: string
  detail: string
  address?: string
  sol?: bigint
  chips?: bigint
}

export type PlayerSnapshot = { joined: boolean; balance: bigint }

export type FaucetOutcome = { signature: string; lamports: number } | { skipped: true; balance: number }

export type TradeSetupDeps = {
  /** The connected wallet (base58) that setup should use, or null to connect one. */
  getWallet: () => string | null
  connect: () => Promise<string>
  signIn: (wallet: string) => Promise<void>
  getSolBalance: (wallet: string) => Promise<bigint>
  requestSol: (wallet: string) => Promise<FaucetOutcome>
  ensurePlayer: (wallet: string) => Promise<{ delegateSignature: string | null }>
  ensureSession: (wallet: string) => Promise<{ signature: string | null }>
  getPlayer: (wallet: string) => Promise<PlayerSnapshot | null>
  claimChips: (wallet: string) => Promise<{ signature: string; ms: number }>
}

export const idleTradeSetupStatus: TradeSetupStatus = {
  step: 'idle',
  title: 'PLAY AS GUEST',
  detail: 'Play with a devnet guest wallet, or connect Phantom, Solflare or Backpack.',
}

const setupTitles: Record<TradeSetupStep, string> = {
  connecting: 'CONNECTING',
  signing_in: 'SIGNING IN',
  checking_balances: 'CHECKING FUNDS',
  funding_sol: 'FUNDING SOL',
  delegating_player: 'JOINING ROLLUP',
  creating_session: 'CREATING SESSION',
  claiming_chips: 'CLAIMING CHIPS',
  ready: 'READY TO TRADE',
}

export function isBusyTradeSetup(step: TradeSetupPhase) {
  return step !== 'idle' && step !== 'ready' && step !== 'error'
}

export function faucetNeeds(balances: TradeSetupBalances) {
  return {
    sol: balances.sol < SOL_MIN_LAMPORTS,
    chips: balances.chips < FAUCET_MAX_BALANCE,
  }
}

export function formatUnits(value: bigint, decimals: number) {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals)
  return `${negative ? '-' : ''}${whole}${decimals > 0 ? `.${fraction}` : ''}`
}

export function formatTokenAmount(value: bigint, decimals: number) {
  return formatDecimalAmount(formatUnits(value, decimals))
}

export function formatBalanceLine(balances: TradeSetupBalances) {
  return `${formatTokenAmount(balances.sol, SOL_DECIMALS)} SOL (devnet) · ${formatTokenAmount(balances.chips, CHIPS_DECIMALS)} chips`
}

export { errorMessage }
export { formatAddress as shortAddress }

export function tradeSetupProgress(step: TradeSetupPhase) {
  if (step === 'idle' || step === 'error') return 0
  if (step === 'connecting' || step === 'signing_in') return 1
  if (step === 'checking_balances' || step === 'funding_sol') return 2
  if (step === 'delegating_player') return 3
  if (step === 'creating_session' || step === 'claiming_chips') return 4
  return 5
}

export function islandStageFromSetup(input: {
  authenticated: boolean
  step: TradeSetupPhase
  zone: IslandZone
  address?: string
  settled?: boolean
}): IslandStage {
  if (!input.authenticated) {
    if (input.step === 'connecting') return 'preparing'
    if (input.step === 'error') return 'error'
    return 'unconnected'
  }

  if (input.settled && input.address) return input.zone
  if (input.step === 'ready') return input.zone
  if (input.step === 'error') return 'error'
  return 'preparing'
}

export function canApplyAbilityOnIsland(stage: IslandStage) {
  return stage === 'trading-zone'
}

type StatusExtra = {
  address?: string
  balances?: TradeSetupBalances
  alreadyConnected?: boolean
}

export function tradeSetupStatus(step: TradeSetupStep, extra: StatusExtra = {}): TradeSetupStatus {
  const status: TradeSetupStatus = {
    step,
    title: setupTitles[step],
    detail: detailFor(step, extra),
    address: extra.address,
  }

  if (extra.balances) {
    status.sol = extra.balances.sol
    status.chips = extra.balances.chips
  }

  return status
}

export function failedTradeSetupStatus(
  error: unknown,
  extra: { address?: string; balances?: TradeSetupBalances } = {},
): TradeSetupStatus {
  return {
    step: 'error',
    title: 'COULD NOT START',
    detail: errorMessage(error),
    address: extra.address,
    sol: extra.balances?.sol,
    chips: extra.balances?.chips,
  }
}

async function readBalances(deps: Pick<TradeSetupDeps, 'getSolBalance' | 'getPlayer'>, wallet: string) {
  const [sol, player] = await Promise.all([
    wrap('Could not read the devnet SOL balance', () => deps.getSolBalance(wallet)),
    wrap('Could not read your player account', () => deps.getPlayer(wallet)),
  ])
  return { balances: { sol, chips: player?.balance ?? 0n }, player }
}

export async function refreshTradeBalances(
  deps: Pick<TradeSetupDeps, 'getSolBalance' | 'getPlayer'>,
  address: string,
  onStatus: (status: TradeSetupStatus) => void,
  current?: TradeSetupBalances,
) {
  onStatus(tradeSetupStatus('checking_balances', { address, balances: current }))
  const { balances } = await readBalances(deps, address)
  onStatus(tradeSetupStatus('ready', { address, balances }))
  return { address, ...balances }
}

export async function fundTradeWallet(
  deps: Pick<TradeSetupDeps, 'getSolBalance' | 'getPlayer' | 'requestSol' | 'claimChips'>,
  address: string,
  onStatus: (status: TradeSetupStatus) => void,
  asset?: FaucetAsset,
) {
  let { balances, player } = await readBalances(deps, address)
  onStatus(tradeSetupStatus('checking_balances', { address, balances }))

  const needs = faucetNeeds(balances)
  const fundSol = (!asset || asset === 'SOL') && needs.sol
  const claim = asset === 'CHIPS' ? needs.chips || !player?.joined : !asset && !player?.joined

  if (fundSol) {
    onStatus(tradeSetupStatus('funding_sol', { address, balances }))
    await wrap('SOL faucet failed', () => deps.requestSol(address))
  }

  if (claim) {
    onStatus(tradeSetupStatus('claiming_chips', { address, balances }))
    await wrap('Could not claim chips', () => deps.claimChips(address))
  }

  if (fundSol || claim) {
    ;({ balances } = await readBalances(deps, address))
  }

  onStatus(tradeSetupStatus('ready', { address, balances }))
  return { address, ...balances }
}

export async function runTradeSetup(deps: TradeSetupDeps, onStatus: (status: TradeSetupStatus) => void) {
  const existing = deps.getWallet()
  onStatus(tradeSetupStatus('connecting', { alreadyConnected: Boolean(existing) }))
  const address = existing ?? (await wrap('Could not connect a wallet', deps.connect))

  onStatus(tradeSetupStatus('signing_in', { address }))
  await wrap('Could not sign in to the arena', () => deps.signIn(address))

  onStatus(tradeSetupStatus('checking_balances', { address }))
  let sol = await wrap('Could not read the devnet SOL balance', () => deps.getSolBalance(address))
  if (sol < SOL_MIN_LAMPORTS) {
    onStatus(tradeSetupStatus('funding_sol', { address, balances: { sol, chips: 0n } }))
    await wrap('SOL faucet failed', () => deps.requestSol(address))
    sol = await wrap('Could not confirm the faucet transfer', () => deps.getSolBalance(address))
  }

  onStatus(tradeSetupStatus('delegating_player', { address, balances: { sol, chips: 0n } }))
  await wrap('Could not delegate your player account to the MagicBlock rollup', () => deps.ensurePlayer(address))

  onStatus(tradeSetupStatus('creating_session', { address }))
  await wrap('Could not create a session key', () => deps.ensureSession(address))

  let player = await wrap('Could not read your player account', () => deps.getPlayer(address))
  if (!player?.joined) {
    onStatus(tradeSetupStatus('claiming_chips', { address }))
    await wrap('Could not claim starting chips', () => deps.claimChips(address))
    player = await wrap('Could not read your chips', () => deps.getPlayer(address))
  }

  const balances = {
    sol: await wrap('Could not read the devnet SOL balance', () => deps.getSolBalance(address)),
    chips: player?.balance ?? 0n,
  }
  onStatus(tradeSetupStatus('ready', { address, balances }))
  return { address, ...balances }
}

function detailFor(step: TradeSetupStep, extra: StatusExtra) {
  const funds = extra.balances ? formatBalanceLine(extra.balances) : null

  if (step === 'connecting') {
    return extra.alreadyConnected
      ? 'Using the connected wallet.'
      : 'Choose Phantom, Solflare or Backpack, or play with a devnet guest wallet.'
  }

  if (step === 'signing_in') {
    return 'Sign one message so the arena knows this wallet. It is not a transaction and costs nothing.'
  }

  if (step === 'checking_balances') {
    return funds ? `Current balances: ${funds}.` : 'Reading devnet SOL and arena chips.'
  }

  if (step === 'funding_sol') {
    const current = extra.balances ? `${formatTokenAmount(extra.balances.sol, SOL_DECIMALS)} SOL` : 'The balance'
    return `${current} is below 0.01 SOL. Requesting devnet SOL from the arena faucet.`
  }

  if (step === 'delegating_player') {
    return 'Creating your player account on Solana devnet and delegating it to the MagicBlock ephemeral rollup.'
  }

  if (step === 'creating_session') {
    return 'Creating a 24-hour session key so trades on the rollup need no wallet popups.'
  }

  if (step === 'claiming_chips') {
    return `Claiming chips on the ephemeral rollup (${formatTokenAmount(START_CHIPS, CHIPS_DECIMALS)} to start).`
  }

  const wallet = extra.address ? formatAddress(extra.address) : 'Wallet'
  return funds ? `${wallet} · ${funds}` : `${wallet} is ready to trade.`
}

async function wrap<T>(prefix: string, run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    throw new Error(`${prefix}. ${errorMessage(error)}`)
  }
}
