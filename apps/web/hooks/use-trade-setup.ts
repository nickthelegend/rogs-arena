'use client'

import { env } from '@/env'
import { publicClient } from '@/lib/viem'
import {
  errorMessage,
  failedTradeSetupStatus,
  faucetErrorMessage,
  faucetNeeds,
  fundTradeWallet,
  idleTradeSetupStatus,
  isBusyTradeSetup,
  refreshTradeBalances,
  runTradeSetup,
  tradeWallet,
  type FaucetAsset,
  type TradeSetupStatus,
  type TradeSetupUser,
} from '@/lib/trade-setup'
import {
  useCreateWallet,
  useLogin,
  usePrivy,
  useSigners,
  useUser,
  type User,
} from '@privy-io/react-auth'
import { SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseAbi, type Address } from 'viem'

const testUsdcAddress = SOMNIA_TESTNET_ADDRESSES.testUsdc as Address
const erc20BalanceAbi = parseAbi(['function balanceOf(address account) view returns (uint256)'])
const loginMethods = ['google', 'email', 'wallet'] as const

type LoginWaiter = {
  resolve: (user: User) => void
  reject: (error: Error) => void
}

function asTradeUser(user: User | null | undefined): TradeSetupUser | null {
  return user ?? null
}

export function useTradeSetup() {
  const { ready, authenticated, user } = usePrivy()
  const { refreshUser } = useUser()
  const { createWallet } = useCreateWallet()
  const { addSigners } = useSigners()
  const [status, setStatus] = useState<TradeSetupStatus>(idleTradeSetupStatus)
  const [didPrepare, setDidPrepare] = useState(false)
  const runningRef = useRef(false)
  const userRef = useRef(user)
  const authenticatedRef = useRef(authenticated)
  const statusRef = useRef(status)
  const loginWaiterRef = useRef<LoginWaiter | null>(null)

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    authenticatedRef.current = authenticated
  }, [authenticated])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const { login } = useLogin({
    onComplete: (params) => {
      userRef.current = params.user
      loginWaiterRef.current?.resolve(params.user)
      loginWaiterRef.current = null
    },
    onError: (error) => {
      const waiter = loginWaiterRef.current
      loginWaiterRef.current = null
      const message = errorMessage(error)
      waiter?.reject(new Error(message === 'Unknown error' ? 'Sign-in was cancelled.' : message))
    },
  })

  const deps = useCallback(
    () => ({
      getUser: () => asTradeUser(userRef.current),
      connect: () =>
        new Promise<TradeSetupUser>((resolve, reject) => {
          const existing = userRef.current
          if (authenticatedRef.current && existing) {
            resolve(existing)
            return
          }

          loginWaiterRef.current = {
            resolve: (next) => resolve(next),
            reject,
          }

          try {
            const pending = login({ loginMethods: [...loginMethods] })
            void Promise.resolve(pending).catch((error: unknown) => {
              if (!loginWaiterRef.current) return
              loginWaiterRef.current = null
              reject(error instanceof Error ? error : new Error('Could not open Privy.'))
            })
          } catch (error) {
            loginWaiterRef.current = null
            reject(error instanceof Error ? error : new Error('Could not open Privy.'))
          }
        }),
      createWallet: async () => {
        const wallet = await createWallet()
        if (!wallet?.address) throw new Error('Privy did not return a wallet address.')
        return { address: wallet.address, id: wallet.id ?? null }
      },
      assignSigner: async (address: string) => {
        const result = await addSigners({
          address,
          signers: [{ signerId: env.NEXT_PUBLIC_AUTHORIZATION_ID }],
        })
        if (result?.user) userRef.current = result.user
      },
      refreshUser: async () => {
        const next = await refreshUser()
        if (next) userRef.current = next
      },
      getBalances: async (address: string) => {
        const account = address as Address
        const [stt, tusdc] = await Promise.all([
          publicClient.getBalance({ address: account }),
          publicClient.readContract({
            address: testUsdcAddress,
            abi: erc20BalanceAbi,
            functionName: 'balanceOf',
            args: [account],
          }),
        ])

        return { stt, tusdc }
      },
      faucet: async (asset: FaucetAsset, amount: string, address: string) => {
        const response = await fetch('/api/faucet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, asset, amount }),
        })
        const result = (await response.json().catch(() => ({}))) as {
          error?: string
          details?: string | string[]
        }

        if (!response.ok) {
          throw new Error(faucetErrorMessage(result))
        }
      },
    }),
    [addSigners, createWallet, login, refreshUser],
  )

  const fail = useCallback((error: unknown) => {
    const current = statusRef.current
    const wallet = tradeWallet(asTradeUser(userRef.current))
    const address = wallet?.address ?? current.address
    const balances =
      current.stt != null && current.tusdc != null ? { stt: current.stt, tusdc: current.tusdc } : undefined
    if (address) setDidPrepare(true)
    setStatus(failedTradeSetupStatus(error, { address, balances }))
  }, [])

  const start = useCallback(async () => {
    if (!ready || runningRef.current) return

    runningRef.current = true
    setDidPrepare(false)
    try {
      await runTradeSetup(deps(), setStatus)
      setDidPrepare(true)
    } catch (error) {
      fail(error)
    } finally {
      runningRef.current = false
    }
  }, [deps, fail, ready])

  const fund = useCallback(
    async (asset?: FaucetAsset) => {
      const address = statusRef.current.address ?? tradeWallet(asTradeUser(userRef.current))?.address
      if (!ready || runningRef.current || !address) return

      runningRef.current = true
      try {
        await fundTradeWallet(deps(), address, setStatus, asset)
        setDidPrepare(true)
      } catch (error) {
        fail(error)
      } finally {
        runningRef.current = false
      }
    },
    [deps, fail, ready],
  )

  const refresh = useCallback(async () => {
    const current = statusRef.current
    const address = current.address ?? tradeWallet(asTradeUser(userRef.current))?.address
    if (!ready || runningRef.current || !address) return

    const currentBalances =
      current.stt != null && current.tusdc != null ? { stt: current.stt, tusdc: current.tusdc } : undefined

    runningRef.current = true
    try {
      await refreshTradeBalances(deps(), address, setStatus, currentBalances)
      setDidPrepare(true)
    } catch (error) {
      fail(error)
    } finally {
      runningRef.current = false
    }
  }, [deps, fail, ready])

  useEffect(() => {
    if (!ready || !authenticated || status.step !== 'idle') return
    const timer = window.setTimeout(() => {
      void start()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [authenticated, ready, start, status.step])

  const balances = status.stt != null && status.tusdc != null ? { stt: status.stt, tusdc: status.tusdc } : undefined

  return {
    ready,
    authenticated,
    user,
    status,
    balances,
    needs: balances ? faucetNeeds(balances) : { stt: Boolean(status.address), tusdc: Boolean(status.address) },
    settled: authenticated && didPrepare,
    busy: isBusyTradeSetup(status.step),
    start,
    fund,
    refresh,
  }
}
