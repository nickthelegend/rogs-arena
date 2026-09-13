import { describe, expect, test } from 'bun:test'
import {
  canApplyAbilityOnIsland,
  failedTradeSetupStatus,
  faucetNeeds,
  formatBalanceLine,
  formatTokenAmount,
  formatUnits,
  fundTradeWallet,
  idleTradeSetupStatus,
  islandStageFromSetup,
  isBusyTradeSetup,
  refreshTradeBalances,
  runTradeSetup,
  shortAddress,
  tradeSetupProgress,
  tradeSetupStatus,
  type TradeSetupDeps,
  type TradeSetupStatus,
} from '../trade-setup'

const wallet = 'Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr'
const SOL = 1_000_000_000n
const USD = 1_000_000n

type Harness = TradeSetupDeps & { calls: string[] }

function harness(options: { connected?: boolean; joined?: boolean; sol?: bigint[] } = {}, overrides: Partial<TradeSetupDeps> = {}): Harness {
  const calls: string[] = []
  let connected = options.connected ? wallet : null
  let joined = options.joined ?? false
  let chips = joined ? 120n * USD : 0n
  const readings = [...(options.sol ?? [SOL])]

  const deps: TradeSetupDeps = {
    getWallet: () => connected,
    connect: async () => {
      calls.push('connect')
      connected = wallet
      return wallet
    },
    signIn: async (address) => {
      calls.push(`signIn:${address}`)
    },
    getSolBalance: async () => {
      calls.push('getSolBalance')
      return (readings.length > 1 ? readings.shift() : readings[0]) as bigint
    },
    requestSol: async (address) => {
      calls.push(`requestSol:${address}`)
      return { signature: 'faucetSig', lamports: 20_000_000 }
    },
    ensurePlayer: async () => {
      calls.push('ensurePlayer')
      return { delegateSignature: 'delegateSig' }
    },
    ensureSession: async () => {
      calls.push('ensureSession')
      return { signature: 'sessionSig' }
    },
    getPlayer: async () => {
      calls.push('getPlayer')
      return { joined, balance: chips }
    },
    claimChips: async () => {
      calls.push('claimChips')
      joined = true
      chips = 250n * USD
      return { signature: 'claimSig', ms: 42 }
    },
    ...overrides,
  }

  return { ...deps, calls }
}

async function collect(run: (onStatus: (status: TradeSetupStatus) => void) => Promise<unknown>) {
  const statuses: TradeSetupStatus[] = []
  const result = await run((status) => statuses.push(status))
  return { result, statuses, steps: statuses.map((status) => status.step) }
}

describe('runTradeSetup', () => {
  test('takes a brand-new guest from connect to delegated player, session key, and starting chips', async () => {
    const setup = harness({ sol: [0n, 20_000_000n, 15_000_000n] })
    const { result, steps } = await collect((onStatus) => runTradeSetup(setup, onStatus))

    expect(setup.calls).toEqual([
      'connect',
      `signIn:${wallet}`,
      'getSolBalance',
      `requestSol:${wallet}`,
      'getSolBalance',
      'ensurePlayer',
      'ensureSession',
      'getPlayer',
      'claimChips',
      'getPlayer',
      'getSolBalance',
    ])
    expect(steps).toEqual([
      'connecting',
      'signing_in',
      'checking_balances',
      'funding_sol',
      'delegating_player',
      'creating_session',
      'claiming_chips',
      'ready',
    ])
    expect(result).toEqual({ address: wallet, sol: 15_000_000n, chips: 250n * USD })
  })

  test('a returning funded player skips the faucet and the chip claim', async () => {
    const setup = harness({ connected: true, joined: true })
    const { steps } = await collect((onStatus) => runTradeSetup(setup, onStatus))

    expect(setup.calls).not.toContain('connect')
    expect(setup.calls.some((call) => call.startsWith('requestSol'))).toBe(false)
    expect(setup.calls).not.toContain('claimChips')
    expect(steps).not.toContain('funding_sol')
    expect(steps.at(-1)).toBe('ready')
  })

  test('surfaces a cancelled connection without touching the chain', async () => {
    const setup = harness({}, {
      connect: async () => {
        throw new Error('Wallet connection was cancelled.')
      },
    })

    await expect(runTradeSetup(setup, () => {})).rejects.toThrow(
      'Could not connect a wallet. Wallet connection was cancelled.',
    )
    expect(setup.calls).toEqual([])
  })

  test('surfaces the program error when delegation fails', async () => {
    const setup = harness({ connected: true }, {
      ensurePlayer: async () => {
        throw new Error('Attempt to debit an account but found no record of a prior credit.')
      },
    })

    await expect(runTradeSetup(setup, () => {})).rejects.toThrow(
      'Could not delegate your player account to the MagicBlock rollup. Attempt to debit an account but found no record of a prior credit.',
    )
    expect(setup.calls).not.toContain('ensureSession')
  })
})

describe('fundTradeWallet', () => {
  test('claims chips only when asked and below the faucet ceiling', async () => {
    const low = harness({ connected: true, joined: true }, {
      getPlayer: async () => ({ joined: true, balance: 10n * USD }),
    })
    await collect((onStatus) => fundTradeWallet(low, wallet, onStatus, 'CHIPS'))
    expect(low.calls).toContain('claimChips')

    const rich = harness({ connected: true, joined: true }, {
      getPlayer: async () => ({ joined: true, balance: 90n * USD }),
    })
    await collect((onStatus) => fundTradeWallet(rich, wallet, onStatus, 'CHIPS'))
    expect(rich.calls).not.toContain('claimChips')
  })

  test('only requests SOL when the wallet is below 0.01 SOL', async () => {
    const setup = harness({ connected: true, joined: true, sol: [5_000_000n] })
    const { steps } = await collect((onStatus) => fundTradeWallet(setup, wallet, onStatus, 'SOL'))

    expect(setup.calls).toContain(`requestSol:${wallet}`)
    expect(steps).toContain('funding_sol')
  })
})

describe('refreshTradeBalances', () => {
  test('rereads SOL and chips without calling a faucet', async () => {
    const setup = harness({ connected: true, joined: true, sol: [2n * SOL] })
    const { result, steps } = await collect((onStatus) => refreshTradeBalances(setup, wallet, onStatus))

    expect(result).toEqual({ address: wallet, sol: 2n * SOL, chips: 120n * USD })
    expect(setup.calls).toEqual(['getSolBalance', 'getPlayer'])
    expect(steps).toEqual(['checking_balances', 'ready'])
  })
})

describe('balances and copy', () => {
  test('flags SOL under 0.01 and chips under the on-chain faucet ceiling', () => {
    expect(faucetNeeds({ sol: 9_999_999n, chips: 50n * USD })).toEqual({ sol: true, chips: false })
    expect(faucetNeeds({ sol: 10_000_000n, chips: 50n * USD - 1n })).toEqual({ sol: false, chips: true })
  })

  test('formats lamports and chip units', () => {
    expect(formatUnits(5n, 6)).toBe('0.000005')
    expect(formatTokenAmount(1_500_000_000n, 9)).toBe('1.5')
    expect(formatBalanceLine({ sol: 20_000_000n, chips: 250_500_000n })).toBe('0.02 SOL (devnet) · 250.5 chips')
    expect(shortAddress(wallet)).toBe('Ens1…yVvr')
  })

  test('names each step for the player', () => {
    expect(idleTradeSetupStatus.title).toBe('PLAY AS GUEST')
    expect(tradeSetupStatus('funding_sol', { balances: { sol: 4_000_000n, chips: 0n } }).detail).toBe(
      '0.004 SOL is below 0.01 SOL. Requesting devnet SOL from the arena faucet.',
    )
    expect(tradeSetupStatus('delegating_player').title).toBe('JOINING ROLLUP')
    expect(tradeSetupStatus('ready', { address: wallet, balances: { sol: 20_000_000n, chips: 250n * USD } }).detail).toBe(
      'Ens1…yVvr · 0.02 SOL (devnet) · 250 chips',
    )
    expect(failedTradeSetupStatus(new Error('User rejected the request.')).detail).toBe('User rejected the request.')
    expect(isBusyTradeSetup('creating_session')).toBe(true)
    expect(isBusyTradeSetup('ready')).toBe(false)
    expect(tradeSetupProgress('signing_in')).toBe(1)
    expect(tradeSetupProgress('delegating_player')).toBe(3)
    expect(tradeSetupProgress('ready')).toBe(5)
  })
})

describe('islandStageFromSetup', () => {
  test('starts unconnected until a connection is in progress', () => {
    expect(islandStageFromSetup({ authenticated: false, step: 'idle', zone: 'information' })).toBe('unconnected')
    expect(islandStageFromSetup({ authenticated: false, step: 'connecting', zone: 'information' })).toBe('preparing')
    expect(islandStageFromSetup({ authenticated: false, step: 'ready', zone: 'trading-zone' })).toBe('unconnected')
  })

  test('prepares while setup runs and shows the chosen pane when ready', () => {
    expect(islandStageFromSetup({ authenticated: true, step: 'creating_session', zone: 'information' })).toBe('preparing')
    expect(islandStageFromSetup({ authenticated: true, step: 'ready', zone: 'trading-zone' })).toBe('trading-zone')
    expect(islandStageFromSetup({ authenticated: true, step: 'ready', zone: 'wearable' })).toBe('wearable')
  })

  test('keeps a prepared wallet on its pane after a faucet interrupt so funds can be retried', () => {
    expect(
      islandStageFromSetup({ authenticated: true, step: 'error', zone: 'information', address: wallet, settled: true }),
    ).toBe('information')
    expect(islandStageFromSetup({ authenticated: false, step: 'error', zone: 'information' })).toBe('error')
  })
})

describe('canApplyAbilityOnIsland', () => {
  test('only the trading zone accepts an ability drop', () => {
    expect(canApplyAbilityOnIsland('trading-zone')).toBe(true)
    expect(canApplyAbilityOnIsland('information')).toBe(false)
    expect(canApplyAbilityOnIsland('unconnected')).toBe(false)
  })
})
