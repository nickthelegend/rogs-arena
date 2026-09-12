import { errorMessage } from '@/lib/error'
import privy, { authorizationContext } from '@/lib/privy'
import { requirePrivyEthereumWallet, TradingApiError } from '@/app/api/privy-auth'
import { verifyMessage } from 'viem'
import { z } from 'zod'

export const runtime = 'nodejs'

const signMessageBodySchema = z.object({
  wallet_id: z.string().min(1),
  message: z.string().min(1).max(2_000).optional(),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parseResult = signMessageBodySchema.safeParse(body)

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
  const message =
    parseResult.data.message ?? `Rizz Club server-sign test at ${new Date().toISOString()}`

  try {
    const { wallet } = await requirePrivyEthereumWallet(request, walletId)

    const signedMessage = await privy.wallets().ethereum().signMessage(walletId, {
      message,
      authorization_context: authorizationContext,
    })

    const verified = await verifyMessage({
      address: wallet.address as `0x${string}`,
      message,
      signature: signedMessage.signature as `0x${string}`,
    })

    return Response.json({
      walletId,
      address: wallet.address,
      message,
      signature: signedMessage.signature,
      encoding: signedMessage.encoding,
      verified,
      serverSignEnabled: verified,
    })
  } catch (error) {
    console.error('Server sign message failed:', error)

    if (error instanceof TradingApiError) {
      return Response.json(
        {
          error: error.message,
          ...error.context,
          walletId,
          serverSignEnabled: false,
        },
        { status: error.status }
      )
    }

    return Response.json(
      {
        error: 'Server sign message failed',
        details: errorMessage(error),
        walletId,
        serverSignEnabled: false,
      },
      { status: 500 }
    )
  }
}
