import { errorMessage } from '@/lib/error'
import { createDreamDexExchange } from '@/lib/dreamdex'
import {
  getCachedBinaryBookParams,
  getCachedMarketOnchain,
  setCachedBinaryBookParams,
  setCachedMarketOnchain,
} from '@/lib/dreamdex'
import { type Hex } from 'viem'
import { z } from 'zod'

export const runtime = 'nodejs'

const prefetchMarketBodySchema = z.object({
  market_id: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parseResult = prefetchMarketBodySchema.safeParse(body)

  if (!parseResult.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const { market_id: marketId } = parseResult.data
  const cached = getCachedMarketOnchain(marketId)
  let exchange: ReturnType<typeof createDreamDexExchange> | null = null

  try {
    const onchain = cached ?? (await (exchange = createDreamDexExchange()).client.getMarketOnchain(marketId as Hex))
    setCachedMarketOnchain(marketId, onchain)

    if (!getCachedBinaryBookParams(onchain.pool)) {
      exchange ??= createDreamDexExchange()
      setCachedBinaryBookParams(onchain.pool, await exchange.client.getBinaryBookParams(onchain.pool))
    }

    return Response.json({
      marketId,
      cached: Boolean(cached),
      status: onchain.status,
      pool: onchain.pool,
    })
  } catch (error) {
    return Response.json(
      {
        error: 'Prefetch DreamDex market failed',
        details: errorMessage(error),
        marketId,
      },
      { status: 500 },
    )
  } finally {
    await exchange?.close()
  }
}
