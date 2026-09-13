import { describe, expect, test } from 'bun:test'
import { runTradeSetup, type TradeSetupDeps } from '@/lib/trade-setup'

const WALLET = '4FKvHgCSjSsatRXHBgq4L7bSH6Nnxq3vHJgKujxsb1KC'

describe('trade setup for a returning player', () => {
  test('a joined player that already holds chips never calls the chips faucet', async () => {
    const calls: string[] = []
    const deps = {
      getWallet: () => WALLET,
      connect: async () => WALLET,
      signIn: async () => {
        calls.push('signIn')
      },
      getSolBalance: async () => 22_000_000n,
      requestSol: async () => {
        calls.push('requestSol')
        return { skipped: true, balance: 22_000_000 }
      },
      ensurePlayer: async () => {
        calls.push('ensurePlayer')
        return { delegateSignature: null }
      },
      ensureSession: async () => {
        calls.push('ensureSession')
        return { signature: 'session' }
      },
      getPlayer: async () => ({ joined: true, balance: 245_000_000n }),
      claimChips: async () => {
        calls.push('claimChips')
        throw new Error('Balance is too high to use the faucet')
      },
    } as unknown as TradeSetupDeps
    const steps: string[] = []
    const result = await runTradeSetup(deps, (status) => steps.push(status.step))
    expect(calls).not.toContain('claimChips')
    expect(calls).not.toContain('requestSol')
    expect(steps.at(-1)).toBe('ready')
    expect(result.chips).toBe(245_000_000n)
  })
})
