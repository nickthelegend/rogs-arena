import { requirePrivyEthereumWallet, TradingApiError } from '@/app/api/privy-auth'
import { errorMessage } from '@/lib/error'
import { applyParkedAbility, settleResolvedAbilityPlays } from '@/services/ability-settle'
import { z } from 'zod'

export const runtime = 'nodejs'

const settleBodySchema = z.object({
  wallet_id: z.string().min(1),
  market_id: z.string().min(1).optional(),
  ability_id: z.number().int().positive().optional(),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parseResult = settleBodySchema.safeParse(body)

  if (!parseResult.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  try {
    const { wallet_id: walletId, market_id: marketId, ability_id: abilityId } = parseResult.data
    const { wallet } = await requirePrivyEthereumWallet(request, walletId)
    const play =
      abilityId && marketId
        ? await applyParkedAbility({
            abilityId,
            address: wallet.address,
            walletId,
            marketId,
          })
        : null
    const settlements = await settleResolvedAbilityPlays(wallet.address)
    return Response.json({
      walletId,
      address: wallet.address,
      play,
      settlements,
    })
  } catch (error) {
    console.error('Settle abilities failed:', error)

    if (error instanceof TradingApiError) {
      return Response.json(
        {
          error: error.message,
          ...error.context,
        },
        { status: error.status },
      )
    }

    return Response.json(
      {
        error: 'Settle abilities failed',
        details: errorMessage(error),
      },
      { status: 500 },
    )
  }
}
