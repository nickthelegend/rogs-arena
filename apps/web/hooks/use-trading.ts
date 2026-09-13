'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { useCurrentMarket } from '@/hooks/use-current-market'
import { useMarketBoard } from '@/hooks/use-market-board'
import { usePlayer } from '@/hooks/use-player'
import { useTradeSetup } from '@/hooks/use-trade-setup'
import { abilityCardById } from '@/lib/ability'
import { getSettlements } from '@/lib/arena-api'
import { errorMessage } from '@/lib/error'
import { marketsToSettle, marketSymbolOfRound, positionsToSettle, type MarketRounds } from '@/lib/markets'
import { nowSeconds, type ArenaSession } from '@/lib/session-key'
import {
  abilityCode,
  binaryMarketId,
  buyQuote,
  canPlaceTrade,
  canTakeProfit as canTakeProfitPositions,
  DEFAULT_TRADE_AMOUNT,
  formatSettlementMessage,
  formatTakeProfitResultMessage,
  formatTradeResultMessage,
  outcomeCode,
  outcomePositions,
  positionTotal,
  exitQuotesFor,
  roundPosition,
  sellablePositions,
  sellQuote,
  settlementSummaryFromDto,
  tradableForOutcome,
  tradeBlockedReason,
  withAbilityMessage,
  type Outcome,
  type PlaceTradeResult,
  type TradeFill,
  type TradeSide,
  type TradingStatus,
} from '@/lib/trading'
import {
  ABILITY_NONE,
  chipsToUsd,
  explorerTxUrl,
  keypairSigner,
  parseArenaEvents,
  sendErTransaction,
  type ArenaEvent,
  type ConfirmedTx,
  type PositionSettled,
} from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

const RECEIPT_ATTEMPTS = 6
const RECEIPT_DELAY_MS = 300

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sessionSigner(session: ArenaSession) {
  return keypairSigner(session.keypair as unknown as Parameters<typeof keypairSigner>[0])
}

function txLink(sent: ConfirmedTx) {
  return { signature: sent.signature, explorerUrl: explorerTxUrl(sent.signature, 'er') }
}

function settledFor(events: ArenaEvent[], owner: PublicKey): PositionSettled[] {
  return events.flatMap((event) =>
    event.name === 'PositionSettled' && event.data.owner.toBase58() === owner.toBase58() ? [event.data] : [],
  )
}

function useTradingController() {
  const { connections, instructions, programId } = useArenaChain()
  const { market, arena, isLoading: isLoadingMarket, error: marketError } = useCurrentMarket()
  const { rounds: boardRounds } = useMarketBoard()
  const { player, isLoading: isLoadingPlayer, error: playerError, refresh: refreshPlayer } = usePlayer()
  const { session, owner } = useTradeSetup()
  const walletId = owner
  const marketId = binaryMarketId(market)
  const [isTrading, setIsTrading] = useState(false)
  const [tradingOutcome, setTradingOutcome] = useState<Outcome | null>(null)
  const [isTakingProfit, setIsTakingProfit] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [status, setStatus] = useState<TradingStatus | null>(null)
  const busyRef = useRef(false)
  const positions = outcomePositions(market, player)
  const busy = isTrading || isClaiming
  const tradeReady = Boolean(session && owner)
  const canTrade = canPlaceTrade({
    walletId: tradeReady ? walletId : null,
    marketId,
    tradable: market?.active ? tradableForOutcome(market, 'YES') : null,
    busy,
  })
  const canTakeProfit = canTakeProfitPositions({
    walletId: tradeReady ? walletId : null,
    marketId: market?.active ? marketId : null,
    positions,
    busy,
  })
  // Exit quotes, TP/SL and cards all read the selected coin's open-round position against that coin's pools.
  const position = roundPosition(player, market?.roundId)
  const positionAbility =
    position && (position.yesShares > 0n || position.noShares > 0n) && position.proceeds === 0n ? position.ability : null
  const exitQuotes = exitQuotesFor(market, position)

  // Round clocks for every coin: the board polls all arenas, the selected coin's live account is fresher.
  const marketRounds = useMemo<MarketRounds>(
    () =>
      arena
        ? {
            ...boardRounds,
            [arena.market]: { id: arena.current.id, status: arena.current.status, endTs: arena.current.endTs },
          }
        : boardRounds,
    [arena, boardRounds],
  )

  // The keeper settles resolved rounds by itself. When a position leaves the player account, report what it
  // paid from the indexed PositionSettled rows, so the result is visible without pressing Claim. Slots are shared
  // by every coin, so this covers positions in any market.
  const activeRoundsRef = useRef<{ owner: string; rounds: number[] } | null>(null)
  const reportedRoundsRef = useRef(new Set<string>())
  useEffect(() => {
    if (!player || !owner) return
    const rounds = player.positions.filter((item) => item.active).map((item) => item.roundId)
    const previous = activeRoundsRef.current
    activeRoundsRef.current = { owner, rounds }
    if (!previous || previous.owner !== owner) return
    const settled = previous.rounds.filter(
      (roundId) => !rounds.includes(roundId) && !reportedRoundsRef.current.has(`${owner}:${roundId}`),
    )
    if (settled.length === 0) return
    for (const roundId of settled) reportedRoundsRef.current.add(`${owner}:${roundId}`)
    void (async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const rows = (
            await Promise.all(
              settled.map((roundId) =>
                getSettlements({ roundId, owner, market: marketSymbolOfRound(roundId) ?? undefined }),
              ),
            )
          )
            .flat()
            .filter((row) => settled.includes(row.roundId))
          if (rows.length >= settled.length) {
            const latest = rows.reduce((left, right) => (right.t > left.t ? right : left))
            setStatus({
              tone: 'success',
              message: formatSettlementMessage(rows.map(settlementSummaryFromDto)),
              signature: latest.sig,
              explorerUrl: explorerTxUrl(latest.sig, 'er'),
            })
            return
          }
        } catch {
          // The indexer can trail the keeper's transaction by a moment; the next attempt retries.
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500))
      }
    })()
  }, [owner, player])

  // A new player or market read error replaces the status line; the same error staying around does not.
  const [shownPlayerError, setShownPlayerError] = useState<string | null>(null)
  if (playerError !== shownPlayerError) {
    setShownPlayerError(playerError)
    if (playerError) setStatus({ tone: 'error', message: playerError })
  }

  const [shownMarketError, setShownMarketError] = useState<string | null>(null)
  if (marketError !== shownMarketError) {
    setShownMarketError(marketError)
    if (marketError) setStatus({ tone: 'error', message: marketError })
  }

  function requireSession() {
    if (!owner) throw new Error('Connect a wallet or play as guest first.')
    if (!session) throw new Error('Finish setup first: this wallet has no session key yet.')
    return { ownerKey: new PublicKey(owner), active: session, signer: sessionSigner(session) }
  }

  /**
   * `settle_player` for every coin (except `exclude`) holding a finished position, one instruction per market.
   * The rounds it covers are marked as reported, since the caller announces the settlement from its own receipt.
   */
  async function settleInstructions(ownerKey: PublicKey, exclude?: number) {
    const now = nowSeconds()
    const held = player?.positions ?? []
    for (const item of positionsToSettle(held, marketRounds, now, { exclude })) {
      reportedRoundsRef.current.add(`${ownerKey.toBase58()}:${item.roundId}`)
    }
    const markets = marketsToSettle(held, marketRounds, now, { exclude })
    return Promise.all(markets.map((id) => instructions.settlePlayer(ownerKey, id)))
  }

  const readEvents = useCallback(
    async (signature: string): Promise<ArenaEvent[]> => {
      let lastError: unknown = null
      for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt++) {
        try {
          const transaction = await connections.er.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          })
          const logs = transaction?.meta?.logMessages
          if (logs) return parseArenaEvents(logs, programId)
        } catch (error) {
          lastError = error
        }
        await sleep(RECEIPT_DELAY_MS)
      }
      throw new Error(lastError ? errorMessage(lastError) : `the rollup has no logs for ${signature} yet`)
    },
    [connections, programId],
  )

  async function placeTrade(
    outcome: Outcome,
    side: TradeSide = 'buy',
    amount?: number,
    abilityId?: number,
  ): Promise<PlaceTradeResult | null> {
    if (side === 'sell') {
      await takeProfit(outcome)
      return null
    }
    if (busyRef.current) return null
    busyRef.current = true

    try {
      setIsTrading(true)
      setTradingOutcome(outcome)
      setStatus({ tone: 'neutral', message: `Buying ${outcome}...` })

      const { ownerKey, active, signer } = requireSession()
      const ability = abilityCode(abilityId)
      const blocked = tradeBlockedReason(market, nowSeconds(), { ability: ability !== ABILITY_NONE })
      if (blocked || !market) throw new Error(blocked ?? 'No live round is open yet.')

      const usd = amount ?? DEFAULT_TRADE_AMOUNT
      const quote = buyQuote(market, outcome, usd)
      // The 4 position slots are shared by every coin. Finished positions of other coins are settled in the same
      // ER transaction, so they never block this buy; `buy` settles this coin's own finished slots itself.
      const settles = await settleInstructions(ownerKey, market.market)
      const instruction = await instructions.buy(
        active.keypair.publicKey,
        ownerKey,
        outcomeCode(outcome),
        quote.amount,
        quote.minShares,
        ability,
        active.token,
        market.market,
      )
      const sent = await sendErTransaction(connections.er, [...settles, instruction], signer)

      let fill: TradeFill = { side: 'buy', outcome, shares: null, usd, ms: sent.ms }
      let abilityPlay: PlaceTradeResult['abilityPlay'] = null
      const notes: string[] = []

      try {
        const events = await readEvents(sent.signature)
        const trade = events.find((event) => event.name === 'TradeExecuted')
        if (trade?.name === 'TradeExecuted') {
          fill = { ...fill, shares: chipsToUsd(trade.data.shares), usd: chipsToUsd(trade.data.amount) }
          if (ability !== ABILITY_NONE && trade.data.ability === ability) abilityPlay = { id: sent.signature }
        }
        const settled = settledFor(events, ownerKey)
        if (settled.length > 0) notes.push(formatSettlementMessage(settled))
      } catch (error) {
        notes.push(`The trade confirmed, but its receipt could not be read: ${errorMessage(error)}.`)
      }

      if (ability !== ABILITY_NONE && !abilityPlay) {
        try {
          const refreshed = await refreshPlayer()
          if (roundPosition(refreshed, market.roundId)?.ability === ability) abilityPlay = { id: sent.signature }
        } catch (error) {
          notes.push(`Could not re-read your position: ${errorMessage(error)}.`)
        }
      }

      const card = ability !== ABILITY_NONE ? abilityCardById(ability) : null
      if (card) {
        notes.unshift(
          abilityPlay
            ? `${card.name} rides on this position.`
            : `${card.name} is not on this position on-chain; it stays parked.`,
        )
      }

      setStatus({
        tone: 'success',
        message: withAbilityMessage(formatTradeResultMessage(fill), notes.join(' ') || null),
        ...txLink(sent),
      })
      return { signature: sent.signature, ms: sent.ms, abilityPlay }
    } catch (error) {
      setStatus({ tone: 'error', message: errorMessage(error) })
      return null
    } finally {
      busyRef.current = false
      setIsTrading(false)
      setTradingOutcome(null)
    }
  }

  async function takeProfit(outcome?: Outcome) {
    const lots = sellablePositions(positions, outcome)
    if (lots.length === 0) {
      setStatus({ tone: 'error', message: 'No shares to sell.' })
      return
    }
    if (busyRef.current) return
    busyRef.current = true

    try {
      setIsTrading(true)
      setIsTakingProfit(true)
      setStatus({ tone: 'neutral', message: outcome ? `Selling ${outcome}...` : 'Selling all shares...' })

      const { ownerKey, active, signer } = requireSession()
      const blocked = tradeBlockedReason(market, nowSeconds())
      if (blocked || !market) throw new Error(blocked ?? 'No live round is open yet.')

      let pools = { yesPool: market.yesPool, noPool: market.noPool, feeBps: market.feeBps }
      const fills: TradeFill[] = []
      const notes: string[] = []
      let last: ConfirmedTx | null = null

      for (const lot of lots) {
        const quote = sellQuote(pools, lot.label, lot.shares)
        const instruction = await instructions.sell(
          active.keypair.publicKey,
          ownerKey,
          outcomeCode(lot.label),
          lot.shares,
          quote.minOut,
          active.token,
          market.market,
        )
        const sent = await sendErTransaction(connections.er, [instruction], signer)
        last = sent
        pools = quote.pools

        let fill: TradeFill = { side: 'sell', outcome: lot.label, shares: lot.total, usd: null, ms: sent.ms }
        try {
          const trade = (await readEvents(sent.signature)).find((event) => event.name === 'TradeExecuted')
          if (trade?.name === 'TradeExecuted') {
            fill = { ...fill, shares: chipsToUsd(trade.data.shares), usd: chipsToUsd(trade.data.amount) }
          }
        } catch (error) {
          notes.push(`The ${lot.label} sale confirmed, but its receipt could not be read: ${errorMessage(error)}.`)
        }
        fills.push(fill)
      }

      setStatus({
        tone: 'success',
        message: [formatTakeProfitResultMessage(fills), ...notes].join(' '),
        ...(last ? txLink(last) : {}),
      })
    } catch (error) {
      setStatus({ tone: 'error', message: errorMessage(error) })
    } finally {
      busyRef.current = false
      setIsTrading(false)
      setIsTakingProfit(false)
    }
  }

  async function claimRewards() {
    if (busyRef.current) return
    busyRef.current = true

    try {
      setIsClaiming(true)
      setStatus({ tone: 'neutral', message: 'Settling resolved rounds on the MagicBlock ER...' })

      const { ownerKey, signer } = requireSession()
      // One settle_player per coin with a finished position; this claim reports its own settlement.
      const settles = await settleInstructions(ownerKey)
      if (settles.length === 0) {
        setStatus({ tone: 'success', message: formatSettlementMessage([]) })
        return
      }
      const sent = await sendErTransaction(connections.er, settles, signer)

      let message: string
      try {
        const settled = settledFor(await readEvents(sent.signature), ownerKey)
        message = `${formatSettlementMessage(settled)} Confirmed in ${Math.round(sent.ms)} ms on the MagicBlock ER.`
      } catch (error) {
        message = `Settlement confirmed in ${Math.round(sent.ms)} ms, but its receipt could not be read: ${errorMessage(error)}.`
      }

      try {
        await refreshPlayer()
      } catch (error) {
        message = `${message} Could not re-read your balance: ${errorMessage(error)}.`
      }

      setStatus({ tone: 'success', message, ...txLink(sent) })
    } catch (error) {
      setStatus({ tone: 'error', message: errorMessage(error) })
    } finally {
      busyRef.current = false
      setIsClaiming(false)
    }
  }

  /** Attaches a card to the position already held in the selected coin's open round (before the ability lock). */
  const attachAbility = useCallback(
    async (abilityId: number): Promise<ConfirmedTx | null> => {
      const card = abilityCardById(abilityId)
      const name = card?.name ?? 'the card'
      try {
        setStatus({ tone: 'neutral', message: `Attaching ${name} on-chain...` })
        if (!owner) throw new Error('Connect a wallet or play as guest first.')
        if (!session) throw new Error('Finish setup first: this wallet has no session key yet.')
        const blocked = tradeBlockedReason(market, nowSeconds(), { ability: true })
        if (blocked || !market) throw new Error(blocked ?? 'No live round is open yet.')

        const instruction = await instructions.attachAbility(
          session.keypair.publicKey,
          new PublicKey(owner),
          abilityCode(abilityId),
          session.token,
          market.market,
        )
        const sent = await sendErTransaction(connections.er, [instruction], sessionSigner(session))
        setStatus({
          tone: 'success',
          message: `${card?.name ?? 'Ability'} attached to your ${market.asset} round position in ${Math.round(sent.ms)} ms on the MagicBlock ER.`,
          ...txLink(sent),
        })
        return sent
      } catch (error) {
        setStatus({ tone: 'error', message: `Could not attach ${name}: ${errorMessage(error)}` })
        return null
      }
    },
    [connections, instructions, market, owner, session],
  )

  return {
    market,
    isLoadingMarket,
    walletId,
    positions,
    yesPosition: positionTotal(positions, 'YES'),
    noPosition: positionTotal(positions, 'NO'),
    address: owner,
    quoteBalance: player ? chipsToUsd(player.balance) : 0,
    status,
    isTrading,
    tradingOutcome,
    isTakingProfit,
    isClaiming,
    isLoadingPositions: isLoadingPlayer,
    canTrade,
    canTakeProfit,
    canClaim: tradeReady && !busy,
    placeTrade,
    takeProfit,
    claimRewards,
    attachAbility,
    /** Ability code on the open-round position, 0 when none, null when there is no attachable position. */
    positionAbility,
    /** Executable exit per side: AMM sell quote after the fee, and its profit against cost basis. */
    exitQuotes,
  }
}

type TradingContextValue = ReturnType<typeof useTradingController>

const TradingContext = createContext<TradingContextValue | null>(null)

/** One trading instance for the page, so the island and the trading pane never race each other. */
export function TradingProvider({ children }: { children: ReactNode }) {
  const value = useTradingController()
  return createElement(TradingContext.Provider, { value }, children)
}

export function useTrading() {
  const context = useContext(TradingContext)
  if (!context) throw new Error('useTrading must be used within TradingProvider')
  return context
}
