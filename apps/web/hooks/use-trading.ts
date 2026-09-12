'use client'

import { useCurrentMarket } from '@/hooks/use-current-market'
import { errorMessage } from '@/lib/error'
import {
  binaryMarketId,
  canPlaceTrade,
  canTakeProfit as canTakeProfitPositions,
  claimRewardsBody,
  formatClaimResultMessage,
  formatTakeProfitResultMessage,
  formatTradeResultMessage,
  withAbilityMessage,
  outcomePositions,
  placePositionBody,
  positionTotal,
  balancesAfterPosition,
  sellablePositions,
  tradableForOutcome,
  tradingApiErrorMessage,
  type Outcome,
  type PlacePositionResult,
  type RewardClaimResult,
  type TradeSide,
  type TradingBalances,
  type TradingStatus,
} from '@/lib/trading'
import { progressHeartRateBpm, recordProgressEvent, type ProgressHeartRate } from '@/lib/progress'
import { tradeWallet } from '@/lib/trade-setup'
import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useRef, useState } from 'react'

export type TradeProgressHint = {
  profit?: number
  heartRate?: ProgressHeartRate
}

type BalancesResponse = {
  balances: TradingBalances
}

export function useTrading() {
  const { user, getAccessToken } = usePrivy()
  const { market, isLoading: isLoadingMarket } = useCurrentMarket()
  const walletId = tradeWallet(user)?.id ?? null
  const marketId = binaryMarketId(market)
  const [balances, setBalances] = useState<TradingBalances | null>(null)
  const [isLoadingPositions, setIsLoadingPositions] = useState(false)
  const [isTrading, setIsTrading] = useState(false)
  const [tradingOutcome, setTradingOutcome] = useState<Outcome | null>(null)
  const [isTakingProfit, setIsTakingProfit] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [status, setStatus] = useState<TradingStatus | null>(null)
  const snapshotGeneration = useRef(0)
  const positions = outcomePositions(market, balances)
  const busy = isTrading || isClaiming
  const canTrade = canPlaceTrade({
    walletId,
    marketId,
    tradable: tradableForOutcome(market, 'YES'),
    busy,
  })
  const canTakeProfit = canTakeProfitPositions({
    walletId,
    marketId,
    positions,
    busy,
  })

  async function tradingApiFetch(url: string, body: unknown) {
    const accessToken = await getAccessToken()
    if (!accessToken) throw new Error('Privy session expired. Please sign in again.')

    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  async function refreshPositions({ silent = false }: { silent?: boolean } = {}) {
    if (!walletId) {
      setBalances(null)
      return
    }

    const generation = snapshotGeneration.current

    try {
      setIsLoadingPositions(true)
      const response = await tradingApiFetch('/api/trading/balances', { wallet_id: walletId })
      const result = (await response.json().catch(() => null)) as BalancesResponse | null

      if (!response.ok) {
        throw new Error(tradingApiErrorMessage(result, 'Failed to load positions'))
      }

      if (generation !== snapshotGeneration.current) return
      setBalances(result?.balances ?? null)
    } catch (error) {
      if (generation !== snapshotGeneration.current) return
      setBalances(null)
      if (!silent) {
        setStatus({ tone: 'error', message: `Could not load positions: ${errorMessage(error)}` })
      }
    } finally {
      if (generation === snapshotGeneration.current) setIsLoadingPositions(false)
    }
  }

  useEffect(() => {
    if (!walletId) return

    let canceled = false
    const generation = snapshotGeneration.current

    void getAccessToken()
      .then((accessToken) => {
        if (!accessToken) throw new Error('Privy session expired. Please sign in again.')
        return fetch('/api/trading/balances', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wallet_id: walletId }),
        })
      })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as BalancesResponse | null
        if (canceled || generation !== snapshotGeneration.current) return

        if (!response.ok) {
          setBalances(null)
          setStatus({
            tone: 'error',
            message: `Could not load positions: ${tradingApiErrorMessage(result, 'Failed to load positions')}`,
          })
          setIsLoadingPositions(false)
          return
        }

        setBalances(result?.balances ?? null)
        setIsLoadingPositions(false)
      })
      .catch((error: unknown) => {
        if (canceled || generation !== snapshotGeneration.current) return
        setBalances(null)
        setStatus({ tone: 'error', message: `Could not load positions: ${errorMessage(error)}` })
        setIsLoadingPositions(false)
      })

    return () => {
      canceled = true
    }
  }, [getAccessToken, walletId])

  useEffect(() => {
    if (!marketId) return

    const controller = new AbortController()
    void fetch('/api/trading/market-prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_id: marketId }),
      signal: controller.signal,
    }).catch(() => {})

    return () => controller.abort()
  }, [marketId])

  useEffect(() => {
    if (!walletId) return

    let canceled = false
    void getAccessToken()
      .then((accessToken) => {
        if (!accessToken || canceled) return
        return fetch('/api/abilities/settle', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wallet_id: walletId }),
        })
      })
      .catch(() => {})

    return () => {
      canceled = true
    }
  }, [getAccessToken, marketId, walletId])

  async function submitPosition(outcome: Outcome, side: TradeSide, amount?: number, abilityId?: number) {
    const tradable = tradableForOutcome(market, outcome)
    if (!walletId || !market || !marketId || !tradable) {
      throw new Error('No live market is ready to trade yet.')
    }

    const response = await tradingApiFetch(
      '/api/trading/position',
      placePositionBody({
        walletId,
        marketId,
        marketSymbol: market.symbol,
        tradable,
        outcome,
        side,
        amount,
        abilityId: side === 'buy' ? abilityId : undefined,
      }),
    )
    const result = (await response.json().catch(() => null)) as PlacePositionResult | null

    if (!response.ok) {
      throw new Error(tradingApiErrorMessage(result, 'Failed to place position'))
    }

    snapshotGeneration.current += 1
    setBalances((current) =>
      balancesAfterPosition({
        current,
        reported: result?.balances,
        symbol: tradable,
        side,
        filled: result?.order.filled ?? 0,
      }),
    )
    return result
  }

  async function placeTrade(outcome: Outcome, side: TradeSide = 'buy', amount?: number, abilityId?: number) {
    try {
      setIsTrading(true)
      setTradingOutcome(outcome)
      setStatus({
        tone: 'neutral',
        message: `${side === 'buy' ? 'Buying' : 'Selling'} ${outcome}...`,
      })

      const result = await submitPosition(outcome, side, amount, abilityId)
      const filled = result?.order.filled ?? 0
      setStatus({
        tone: 'success',
        message: withAbilityMessage(
          formatTradeResultMessage({
            side,
            outcome,
            filled,
            amount: result?.order.amount ?? amount ?? 0,
          }),
          result?.abilitySettlement,
        ),
      })
      if (side === 'buy' && filled > 0) recordProgressEvent({ type: 'placed' })
      return result
    } catch (error) {
      setStatus({ tone: 'error', message: errorMessage(error) })
      return null
    } finally {
      setIsTrading(false)
      setTradingOutcome(null)
    }
  }

  async function takeProfit(outcome?: Outcome, progress?: TradeProgressHint) {
    const lots = sellablePositions(positions, outcome)
    if (lots.length === 0) {
      setStatus({ tone: 'error', message: 'No shares to sell.' })
      return
    }

    try {
      setIsTrading(true)
      setIsTakingProfit(true)
      setStatus({
        tone: 'neutral',
        message: outcome ? `Selling ${outcome}...` : 'Selling all shares...',
      })

      const results = []
      let settlement = null
      for (const lot of lots) {
        const result = await submitPosition(lot.label, 'sell', lot.total)
        const filled = result?.order.filled ?? 0
        results.push({
          outcome: lot.label,
          filled,
          amount: result?.order.amount ?? lot.total,
        })
        if (result?.abilitySettlement) settlement = result.abilitySettlement
        const profit = progress?.profit
        if (filled > 0 && profit != null && Number.isFinite(profit)) {
          recordProgressEvent({
            type: 'result',
            won: profit >= 0,
            heartRateBpm: progressHeartRateBpm(progress?.heartRate),
          })
        }
      }

      setStatus({ tone: 'success', message: withAbilityMessage(formatTakeProfitResultMessage(results), settlement) })
    } catch (error) {
      setStatus({ tone: 'error', message: errorMessage(error) })
    } finally {
      setIsTrading(false)
      setIsTakingProfit(false)
    }
  }

  async function claimRewards() {
    if (!walletId) {
      setStatus({ tone: 'error', message: 'No Privy server-signing wallet is available.' })
      return
    }

    try {
      setIsClaiming(true)
      setStatus({ tone: 'neutral', message: 'Checking closed markets for rewards...' })

      const response = await tradingApiFetch('/api/trading/rewards', claimRewardsBody(walletId))
      const result = (await response.json().catch(() => null)) as RewardClaimResult | null

      if (!response.ok) {
        throw new Error(tradingApiErrorMessage(result, 'Failed to claim rewards'))
      }

      if (result?.balances) setBalances(result.balances)
      setStatus({
        tone: 'success',
        message: withAbilityMessage(
          formatClaimResultMessage(result?.claimed.length ?? 0),
          result?.abilitySettlements?.[0],
        ),
      })
      void refreshPositions({ silent: true })
    } catch (error) {
      setStatus({ tone: 'error', message: errorMessage(error) })
    } finally {
      setIsClaiming(false)
    }
  }

  return {
    market,
    isLoadingMarket,
    walletId,
    positions,
    yesPosition: positionTotal(positions, 'YES'),
    noPosition: positionTotal(positions, 'NO'),
    address: tradeWallet(user)?.address ?? null,
    quoteBalance: market?.quote ? (balances?.[market.quote]?.total ?? 0) : 0,
    status,
    isTrading,
    tradingOutcome,
    isTakingProfit,
    isClaiming,
    isLoadingPositions,
    canTrade,
    canTakeProfit,
    canClaim: Boolean(walletId) && !busy,
    placeTrade,
    takeProfit,
    claimRewards,
  }
}
