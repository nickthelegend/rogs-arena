import { errorMessage } from '@/lib/error'
import privy, { authorizationContext } from '@/lib/privy'
import { createDreamDexExchange } from '@/lib/dreamdex'
import { requirePrivyEthereumWallet, TradingApiError } from '@/app/api/privy-auth'
import { createViemAccount } from '@privy-io/node/viem'
import { z } from 'zod'

export const runtime = 'nodejs'

const balanceBodySchema = z.object({
  wallet_id: z.string().min(1),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parseResult = balanceBodySchema.safeParse(body)

  if (!parseResult.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { wallet_id: walletId } = parseResult.data
  let exchange: ReturnType<typeof createDreamDexExchange> | null = null

  try {
    const { wallet } = await requirePrivyEthereumWallet(request, walletId)

    const account = createViemAccount(privy, {
      walletId,
      address: wallet.address as `0x${string}`,
      authorizationContext,
    })

    exchange = createDreamDexExchange({ account })
    const balances = await exchange.fetchBalance()

    return Response.json({
      walletId,
      address: wallet.address,
      balances,
    })
  } catch (error) {
    console.error('Load DreamDex balances failed:', error)

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
        error: 'Load DreamDex balances failed',
        details: errorMessage(error),
        walletId,
      },
      { status: 500 }
    )
  } finally {
    await exchange?.close()
  }
}
