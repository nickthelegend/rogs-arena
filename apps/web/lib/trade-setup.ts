import { errorMessage } from '@/lib/error'
import { formatAddress, formatDecimalAmount } from '@/lib/format'
import { formatUnits, parseEther, parseUnits } from 'viem'

export const STT_MIN = parseEther('2')
export const TUSDC_MIN = parseUnits('50', 6)
export const STT_FAUCET_AMOUNT = '2'
export const TUSDC_FAUCET_AMOUNT = '50'
export const TUSDC_DECIMALS = 6

export const TRADE_SETUP_STEPS = [
  'connecting',
  'creating_wallet',
  'assigning_signer',
  'checking_balances',
  'funding_stt',
  'funding_tusdc',
  'ready',
] as const

export type TradeSetupStep = (typeof TRADE_SETUP_STEPS)[number]
export type TradeSetupPhase = TradeSetupStep | 'idle' | 'error'
export type FaucetAsset = 'STT' | 'tUSDC'
export type IslandStage = 'unconnected' | 'preparing' | 'information' | 'error' | 'trading-zone' | 'wearable'
export type IslandZone = Extract<IslandStage, 'information' | 'trading-zone' | 'wearable'>

export type TradeSetupWallet = {
  address: string
  id?: string | null
  delegated?: boolean | null
}

export type TradeSetupAccount = {
  type?: string
  chainType?: string
  walletClientType?: string
  address?: string
  id?: string | null
  delegated?: boolean | null
}

export type TradeSetupUser = {
  wallet?: { address?: string | null; id?: string | null; delegated?: boolean | null } | null
  linkedAccounts?: TradeSetupAccount[]
}

export type TradeSetupBalances = {
  stt: bigint
  tusdc: bigint
}

export type TradeSetupStatus = {
  step: TradeSetupPhase
  title: string
  detail: string
  address?: string
  stt?: bigint
  tusdc?: bigint
}

export type TradeSetupDeps = {
  getUser: () => TradeSetupUser | null
  connect: () => Promise<TradeSetupUser>
  createWallet: () => Promise<TradeSetupWallet>
  assignSigner: (address: string) => Promise<void>
  refreshUser: () => Promise<void>
  getBalances: (address: string) => Promise<TradeSetupBalances>
  faucet: (asset: FaucetAsset, amount: string, address: string) => Promise<void>
}

export const idleTradeSetupStatus: TradeSetupStatus = {
  step: 'idle',
  title: 'START TRADING',
  detail: 'Sign in, create a wallet, and fund it to trade.',
}

const setupTitles: Record<TradeSetupStep, string> = {
  connecting: 'CONNECTING',
  creating_wallet: 'CREATING WALLET',
  assigning_signer: 'ASSIGNING SIGNER',
  checking_balances: 'CHECKING FUNDS',
  funding_stt: 'FUNDING STT',
  funding_tusdc: 'FUNDING TUSDC',
  ready: 'READY TO TRADE',
}

export function isBusyTradeSetup(step: TradeSetupPhase) {
  return step !== 'idle' && step !== 'ready' && step !== 'error'
}

export function isServerSignableWallet(account: TradeSetupAccount): account is TradeSetupAccount & { address: string } {
  return (
    account.type === 'wallet' &&
    account.chainType === 'ethereum' &&
    (account.walletClientType === 'privy' || account.walletClientType === 'privy-v2') &&
    typeof account.address === 'string' &&
    account.address.length > 0
  )
}

export function tradeWallet(user: TradeSetupUser | null): TradeSetupWallet | null {
  const linked = user?.linkedAccounts?.find(isServerSignableWallet)
  if (linked) {
    return { address: linked.address, id: linked.id ?? null, delegated: linked.delegated ?? null }
  }

  const address = user?.wallet?.address
  if (!address) return null

  return { address, id: user.wallet?.id ?? null, delegated: user.wallet?.delegated ?? null }
}

export function hasAssignedSigner(wallet: TradeSetupWallet) {
  return Boolean(wallet.id) || wallet.delegated === true
}

export function faucetNeeds(balances: TradeSetupBalances) {
  return {
    stt: balances.stt < STT_MIN,
    tusdc: balances.tusdc < TUSDC_MIN,
  }
}

export function formatTokenAmount(value: bigint, decimals: number) {
  return formatDecimalAmount(formatUnits(value, decimals))
}

export function formatBalanceLine(balances: TradeSetupBalances) {
  return `${formatTokenAmount(balances.stt, 18)} STT · ${formatTokenAmount(balances.tusdc, TUSDC_DECIMALS)} tUSDC`
}

export { errorMessage }
export { formatAddress as shortAddress }

export function isRecoverableWalletError(error: unknown) {
  return /already|exist|duplicate/i.test(errorMessage(error))
}

export function faucetErrorMessage(result: { error?: string; details?: string | string[] }) {
  if (Array.isArray(result.details) && result.details.length > 0) {
    return result.details.join(', ')
  }

  if (typeof result.details === 'string' && result.details.length > 0) {
    return result.details
  }

  return result.error ?? 'Faucet request failed'
}

export function tradeSetupProgress(step: TradeSetupPhase) {
  if (step === 'idle' || step === 'error') return 0
  if (step === 'connecting') return 1
  if (step === 'creating_wallet') return 2
  if (step === 'assigning_signer') return 3
  if (step === 'checking_balances' || step === 'funding_stt' || step === 'funding_tusdc') return 4
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

export function tradeSetupStatus(
  step: TradeSetupStep,
  extra: {
    address?: string
    balances?: TradeSetupBalances
    alreadyAuthenticated?: boolean
    walletExists?: boolean
    signerExists?: boolean
  } = {},
): TradeSetupStatus {
  const balances = extra.balances
  const status: TradeSetupStatus = {
    step,
    title: setupTitles[step],
    detail: detailFor(step, extra),
    address: extra.address,
  }

  if (balances) {
    status.stt = balances.stt
    status.tusdc = balances.tusdc
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
    stt: extra.balances?.stt,
    tusdc: extra.balances?.tusdc,
  }
}

export async function refreshTradeBalances(
  deps: Pick<TradeSetupDeps, 'getBalances'>,
  address: string,
  onStatus: (status: TradeSetupStatus) => void,
  current?: TradeSetupBalances,
) {
  onStatus(tradeSetupStatus('checking_balances', { address, balances: current }))
  const balances = await wrap('Could not read STT and tUSDC balances', () => deps.getBalances(address))
  const ready = tradeSetupStatus('ready', { address, balances })
  onStatus(ready)
  return {
    address,
    stt: balances.stt,
    tusdc: balances.tusdc,
  }
}

export async function fundTradeWallet(
  deps: Pick<TradeSetupDeps, 'getBalances' | 'faucet'>,
  address: string,
  onStatus: (status: TradeSetupStatus) => void,
  asset?: FaucetAsset,
) {
  let balances = await wrap('Could not read STT and tUSDC balances', () => deps.getBalances(address))
  onStatus(tradeSetupStatus('checking_balances', { address, balances }))

  const needs = faucetNeeds(balances)
  const fundStt = (!asset || asset === 'STT') && needs.stt
  const fundTusdc = (!asset || asset === 'tUSDC') && needs.tusdc

  if (fundStt) {
    onStatus(tradeSetupStatus('funding_stt', { address, balances }))
    await wrap('STT faucet failed', () => deps.faucet('STT', STT_FAUCET_AMOUNT, address))
  }

  if (fundTusdc) {
    onStatus(tradeSetupStatus('funding_tusdc', { address, balances }))
    await wrap('tUSDC faucet failed', () => deps.faucet('tUSDC', TUSDC_FAUCET_AMOUNT, address))
  }

  if (fundStt || fundTusdc) {
    balances = await wrap('Could not confirm faucet balances', () => deps.getBalances(address))
  }

  const ready = tradeSetupStatus('ready', { address, balances })
  onStatus(ready)
  return {
    address,
    stt: balances.stt,
    tusdc: balances.tusdc,
  }
}

export async function runTradeSetup(
  deps: TradeSetupDeps,
  onStatus: (status: TradeSetupStatus) => void,
) {
  onStatus(tradeSetupStatus('connecting', { alreadyAuthenticated: Boolean(deps.getUser()) }))

  let user = deps.getUser()
  if (!user) {
    user = await wrap('Could not connect to Privy', deps.connect)
  }

  onStatus(tradeSetupStatus('creating_wallet', { walletExists: Boolean(tradeWallet(user)) }))
  let wallet = tradeWallet(user)
  if (!wallet) {
    try {
      wallet = await deps.createWallet()
    } catch (error) {
      await deps.refreshUser()
      wallet = tradeWallet(deps.getUser())
      if (!wallet) throw new Error(`Could not create a wallet. ${errorMessage(error)}`)
    }
    await deps.refreshUser()
    user = deps.getUser() ?? user
    wallet = tradeWallet(user) ?? wallet
  }

  onStatus(tradeSetupStatus('assigning_signer', { address: wallet.address, signerExists: hasAssignedSigner(wallet) }))
  if (!hasAssignedSigner(wallet)) {
    try {
      await deps.assignSigner(wallet.address)
    } catch (error) {
      await deps.refreshUser()
      wallet = tradeWallet(deps.getUser()) ?? wallet
      if (!hasAssignedSigner(wallet) && !isRecoverableWalletError(error)) {
        throw new Error(`Could not assign a trading signer. ${errorMessage(error)}`)
      }
    }
    await deps.refreshUser()
    wallet = tradeWallet(deps.getUser()) ?? wallet
  }

  onStatus(tradeSetupStatus('checking_balances', { address: wallet.address }))
  return fundTradeWallet(deps, wallet.address, onStatus)
}

function detailFor(
  step: TradeSetupStep,
  extra: {
    address?: string
    balances?: TradeSetupBalances
    alreadyAuthenticated?: boolean
    walletExists?: boolean
    signerExists?: boolean
  },
) {
  const funds = extra.balances ? formatBalanceLine(extra.balances) : null

  if (step === 'connecting') {
    return extra.alreadyAuthenticated
      ? 'Confirming your Privy session before preparing the wallet.'
      : 'Open Privy to sign in. We will create a wallet next.'
  }

  if (step === 'creating_wallet') {
    return extra.walletExists
      ? 'Using your existing embedded wallet.'
      : 'Provisioning an embedded Ethereum wallet for trading.'
  }

  if (step === 'assigning_signer') {
    return extra.signerExists
      ? 'Server signer is already assigned to this wallet.'
      : 'Authorizing the app to sign trades for this wallet.'
  }

  if (step === 'checking_balances') {
    return funds ? `Current balances: ${funds}.` : 'Reading STT and tUSDC on Somnia testnet.'
  }

  if (step === 'funding_stt') {
    const current = extra.balances ? `${formatTokenAmount(extra.balances.stt, 18)} STT` : 'below 2 STT'
    return `${current} is below 2 STT. Sending 2 STT from the faucet.`
  }

  if (step === 'funding_tusdc') {
    const current = extra.balances ? `${formatTokenAmount(extra.balances.tusdc, TUSDC_DECIMALS)} tUSDC` : 'below 50 tUSDC'
    return `${current} is below 50 tUSDC. Sending 50 tUSDC from the faucet.`
  }

  const wallet = extra.address ? formatAddress(extra.address) : 'wallet ready'
  return funds ? `${wallet} · ${funds}` : `${wallet} is funded and ready.`
}

async function wrap<T>(prefix: string, run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    throw new Error(`${prefix}. ${errorMessage(error)}`)
  }
}
