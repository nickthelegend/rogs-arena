import { createDreamDexExchange } from '@/lib/dreamdex'
import { getFirebaseDatabase } from '@/lib/firebase'
import { abilityCardById, isAbilityKind, type AbilityKind } from '@/lib/ability'
import {
  abilityPayoutPlan,
  abilityWon,
  closeProfitUsd,
  formatAbilitySettlement,
  roundUsd,
  pickCheersRecipients,
  settlementProfitUsd,
  type AbilitySettlement,
} from '@/lib/ability-payout'
import { sendTusdcFromAdmin } from '@/lib/admin-tusdc'
import { parseTraders, TRADERS_PATH } from '@/lib/traders'
import {
  claimAbilityPlay,
  findAbilityPlayForMarket,
  finishAbilityPlay,
  insertAbilityPlay,
  pendingAbilityPlays,
  parseAbilityPayouts,
  releaseAbilityPlay,
  type AbilityPlayPayout,
  type CreateAbilityPlayInput,
} from '@/services/ability-plays'
import type { AbilityPlay } from '@/db/schema'
import { errorMessage } from '@/lib/error'
import { get, ref } from 'firebase/database'
import { formatUnits, isAddress, type Address, type Hex } from 'viem'
import type { MarketOnchain } from '@somnia-chain/markets-sdk'

export { formatAbilitySettlement }

type Exchange = ReturnType<typeof createDreamDexExchange>

export type AbilityCloseInput = {
  address: string
  marketId: string
  outcome: 'YES' | 'NO'
  soldShares: number
  proceeds: number
}

function playKind(play: AbilityPlay): AbilityKind | null {
  return isAbilityKind(play.kind) ? play.kind : null
}

function playNumbers(play: AbilityPlay) {
  return {
    stakeAmount: Number(play.stakeAmount),
    shares: Number(play.shares),
  }
}

function winningOutcome(onchain: MarketOnchain): 'YES' | 'NO' | null {
  if (onchain.isVoided || !onchain.isResolved) return null
  return onchain.winningOutcome === 0 ? 'YES' : 'NO'
}

async function traderAddresses() {
  try {
    const snapshot = await get(ref(getFirebaseDatabase(), TRADERS_PATH))
    return parseTraders(snapshot.val()).traders.map((trader) => trader.address).filter((address) => isAddress(address))
  } catch (error) {
    console.error('Failed to load traders for cheers:', errorMessage(error))
    return []
  }
}

async function payPlan(kind: AbilityKind, winner: string, won: boolean | null, profit: number, alreadyPaid: AbilityPlayPayout[]) {
  const plan = abilityPayoutPlan(kind, won, profit)
  const transfers: { to: Address; amount: string }[] = []
  const paidKeys = new Set(alreadyPaid.map((payout) => `${payout.to.toLowerCase()}:${payout.amount}`))

  if (plan.playerUsd > 0 && isAddress(winner)) {
    const amount = plan.playerUsd.toFixed(2)
    if (!paidKeys.has(`${winner.toLowerCase()}:${amount}`)) {
      transfers.push({ to: winner, amount })
    }
  }

  if (plan.cheersCount > 0) {
    const recipients = pickCheersRecipients(await traderAddresses(), winner, plan.cheersCount)
    for (const recipient of recipients) {
      if (!isAddress(recipient)) continue
      const amount = plan.cheersUsd.toFixed(2)
      if (paidKeys.has(`${recipient.toLowerCase()}:${amount}`)) continue
      transfers.push({ to: recipient, amount })
    }
  }

  if (transfers.length === 0) {
    return { receipts: alreadyPaid, playerUsd: plan.playerUsd, recipientCount: alreadyPaid.filter((payout) => payout.to.toLowerCase() !== winner.toLowerCase()).length }
  }

  const receipts = await sendTusdcFromAdmin(transfers)
  const merged = [
    ...alreadyPaid,
    ...receipts.map((receipt) => ({ to: receipt.to, amount: receipt.amount, hash: receipt.hash })),
  ]
  const recipientCount = merged.filter((payout) => payout.to.toLowerCase() !== winner.toLowerCase()).length
  return { receipts: merged, playerUsd: plan.playerUsd, recipientCount }
}

async function settlePlay(play: AbilityPlay, profit: number, won: boolean | null): Promise<AbilitySettlement | null> {
  const kind = playKind(play)
  if (!kind) {
    await finishAbilityPlay({ id: play.id, status: 'skipped', profit, payoutAmount: 0, payouts: [] })
    return { kind: 'double_win', status: 'skipped', won, profit, playerUsd: 0, recipientCount: 0 }
  }

  const claimed = await claimAbilityPlay(play.id)
  if (!claimed) return null

  try {
    const paid = await payPlan(kind, play.address, won, profit, parseAbilityPayouts(claimed.payoutsJson))
    const status =
      won == null && paid.playerUsd <= 0 && paid.recipientCount <= 0 ? 'skipped' : 'paid'
    const payoutAmount = paid.receipts.reduce((sum, payout) => sum + Number(payout.amount), 0)
    await finishAbilityPlay({
      id: play.id,
      status,
      profit,
      payoutAmount,
      payouts: paid.receipts,
    })
    return {
      kind,
      status,
      won,
      profit,
      playerUsd: paid.playerUsd,
      recipientCount: paid.recipientCount,
    }
  } catch (error) {
    console.error('Ability payout failed:', errorMessage(error))
    await releaseAbilityPlay(play.id)
    throw error
  }
}

export async function recordAbilityBuy(input: CreateAbilityPlayInput) {
  const card = abilityCardById(input.abilityId)
  if (!card || card.kind !== input.kind) return null
  if (input.shares <= 0 || input.stakeAmount <= 0) return null
  return insertAbilityPlay(input)
}

export async function applyParkedAbility(input: {
  abilityId: number
  address: string
  walletId: string
  marketId: string
}) {
  const card = abilityCardById(input.abilityId)
  if (!card) return null

  const existing = await findAbilityPlayForMarket(input.address, input.marketId)
  if (existing) return existing.status === 'pending' || existing.status === 'settling' ? existing : null

  const exchange = createDreamDexExchange()
  try {
    const onchain = await exchange.client.getMarketOnchain(input.marketId as Hex)
    const pnl = await exchange.client.getBinaryPositionPnL(input.address as Address, input.marketId).catch(() => null)
    if (!pnl) return null

    const yes = Number(formatUnits(pnl.balanceYes, onchain.decimals))
    const no = Number(formatUnits(pnl.balanceNo, onchain.decimals))
    const outcome: 'YES' | 'NO' | null = yes >= no && yes > 0 ? 'YES' : no > 0 ? 'NO' : null
    if (!outcome) return null

    const shares = outcome === 'YES' ? yes : no
    return recordAbilityBuy({
      abilityId: card.id,
      kind: card.kind,
      address: input.address,
      walletId: input.walletId,
      marketId: input.marketId,
      outcome,
      stakeAmount: Math.min(shares, 5),
      shares,
    })
  } catch (error) {
    console.error('Failed to apply parked ability:', errorMessage(error))
    return null
  } finally {
    await exchange.close()
  }
}

export async function settleAbilityClose(input: AbilityCloseInput): Promise<AbilitySettlement | null> {
  const plays = await pendingAbilityPlays(input.address)
  const play = plays.find(
    (item) => item.marketId === input.marketId.toLowerCase() && item.outcome === input.outcome,
  )
  if (!play) return null

  const { stakeAmount, shares } = playNumbers(play)
  const profit = closeProfitUsd({
    stakeAmount,
    shares,
    soldShares: input.soldShares,
    proceeds: input.proceeds,
  })
  return settlePlay(play, profit, abilityWon(profit))
}

async function profitFromResolvedMarket(exchange: Exchange, play: AbilityPlay, onchain: MarketOnchain) {
  const winner = winningOutcome(onchain)
  if (onchain.isVoided) return { profit: 0, won: null as boolean | null }
  if (!winner) return null

  const won = play.outcome === winner
  try {
    const pnl = await exchange.client.getBinaryPositionPnL(play.address as Address, play.marketId)
    if (pnl) {
      const profit = roundUsd(Number(formatUnits(pnl.realizedPnl + pnl.unrealizedPnl, onchain.decimals)))
      return { profit, won: abilityWon(profit) ?? won }
    }
  } catch {
    // Fall through to the share-based estimate when the indexer has not caught up.
  }

  const { stakeAmount, shares } = playNumbers(play)
  return { profit: settlementProfitUsd({ won, stakeAmount, shares }), won }
}

export async function settleResolvedAbilityPlays(address?: string): Promise<AbilitySettlement[]> {
  const plays = await pendingAbilityPlays(address)
  if (plays.length === 0) return []

  const exchange = createDreamDexExchange()
  const settled: AbilitySettlement[] = []

  try {
    for (const play of plays) {
      try {
        const onchain = await exchange.client.getMarketOnchain(play.marketId as Hex)
        if (!onchain.isResolved && !onchain.isVoided) continue

        const resolved = await profitFromResolvedMarket(exchange, play, onchain)
        if (!resolved) continue

        const settlement = await settlePlay(play, resolved.profit, resolved.won)
        if (settlement) settled.push(settlement)
      } catch (error) {
        console.error('Failed to settle ability play:', play.id, errorMessage(error))
      }
    }
  } finally {
    await exchange.close()
  }

  return settled
}
