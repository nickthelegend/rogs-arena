import { errorMessage } from '@/lib/error'
import privy, { authorizationContext } from '@/lib/privy'
import { createDreamDexExchange } from '@/lib/dreamdex'
import { requirePrivyEthereumWallet, TradingApiError } from '@/app/api/privy-auth'
import { createViemAccount } from '@privy-io/node/viem'
import { formatUnits, type Hex } from 'viem'
import { z } from 'zod'
import { settleResolvedAbilityPlays } from '@/services/ability-settle'

export const runtime = 'nodejs'

const claimRewardsBodySchema = z.object({
  wallet_id: z.string().min(1),
  market_ids: z.array(z.string().min(1)).max(120).optional(),
  venue_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(120).default(80),
})

type ClaimableOutcome = {
  label: 'YES' | 'NO'
  index: 0 | 1
  id: bigint
}

function uniqueMarketIds(marketIds: string[]) {
  return Array.from(new Set(marketIds.map((marketId) => marketId.trim()).filter(Boolean)))
}

async function listClaimCandidateMarketIds(
  exchange: ReturnType<typeof createDreamDexExchange>,
  { venueId, limit }: { venueId?: string; limit: number }
) {
  const statuses = ['Finalized', 'Resolved', 'Voided'] as const
  const marketGroups = await Promise.all(
    statuses.map((status) =>
      exchange.client.listBinaryMarkets({
        ...(venueId ? { venueId } : {}),
        status,
        limit,
      })
    )
  )

  return uniqueMarketIds(marketGroups.flat().map((market) => market.marketId)).slice(0, limit)
}

function claimableOutcomes({
  isVoided,
  winningOutcome,
  yesId,
  noId,
}: {
  isVoided: boolean
  winningOutcome: number
  yesId: bigint
  noId: bigint
}): ClaimableOutcome[] {
  if (isVoided) {
    return [
      { label: 'YES', index: 0, id: yesId },
      { label: 'NO', index: 1, id: noId },
    ]
  }

  return winningOutcome === 0
    ? [{ label: 'YES', index: 0, id: yesId }]
    : [{ label: 'NO', index: 1, id: noId }]
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parseResult = claimRewardsBodySchema.safeParse(body)

  if (!parseResult.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { wallet_id: walletId, market_ids: requestedMarketIds, venue_id: venueId, limit } = parseResult.data
  let exchange: ReturnType<typeof createDreamDexExchange> | null = null

  try {
    const { wallet } = await requirePrivyEthereumWallet(request, walletId)
    const address = wallet.address as `0x${string}`

    const account = createViemAccount(privy, {
      walletId,
      address,
      authorizationContext,
    })

    exchange = createDreamDexExchange({ account })

    const marketIds = requestedMarketIds
      ? uniqueMarketIds(requestedMarketIds)
      : await listClaimCandidateMarketIds(exchange, { venueId, limit })

    const claimed = []
    const skipped = []

    for (const marketId of uniqueMarketIds(marketIds)) {
      try {
        const onchain = await exchange.client.getMarketOnchain(marketId as Hex)

        if (!onchain.isResolved && !onchain.isVoided) {
          skipped.push({
            marketId,
            reason: `Market is not resolved or voided yet (status ${onchain.status}).`,
          })
          continue
        }

        for (const outcome of claimableOutcomes(onchain)) {
          const balance = await exchange.client.getOutcomeBalance({
            outcomeToken: onchain.outcomeToken,
            account: address,
            id: outcome.id,
          })

          if (balance === BigInt(0)) {
            skipped.push({
              marketId,
              outcome: outcome.label,
              reason: 'No claimable position balance.',
            })
            continue
          }

          const tx = await exchange.trader.redeem({
            marketId: marketId as Hex,
            market: onchain.marketAddress,
            outcomeToken: onchain.outcomeToken,
            outcomeIdx: outcome.index,
            amount: balance,
          })

          claimed.push({
            marketId,
            outcome: outcome.label,
            amount: formatUnits(balance, onchain.decimals),
            rawAmount: balance.toString(),
            hash: tx.hash,
            status: tx.receipt.status,
          })
        }
      } catch (error) {
        skipped.push({
          marketId,
          reason: errorMessage(error),
        })
      }
    }

    const balances = await exchange.fetchBalance().catch(() => null)
    const abilitySettlements = await settleResolvedAbilityPlays(address).catch((error) => {
      console.error('Failed to settle ability plays after claim:', errorMessage(error))
      return []
    })

    return Response.json({
      walletId,
      address,
      scanned: marketIds.length,
      claimed,
      skipped,
      balances,
      abilitySettlements,
    })
  } catch (error) {
    console.error('Claim DreamDex rewards failed:', error)

    if (error instanceof TradingApiError) {
      return Response.json(
        {
          error: error.message,
          ...error.context,
        },
        { status: error.status }
      )
    }

    return Response.json(
      {
        error: 'Claim DreamDex rewards failed',
        details: errorMessage(error),
        walletId,
      },
      { status: 500 }
    )
  } finally {
    await exchange?.close()
  }
}
