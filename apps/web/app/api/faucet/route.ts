import { env } from '@/env'
import { errorMessage } from '@/lib/error'
import { publicClient } from '@/lib/viem'
import { SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk'
import { somniaShannon } from '@somnia-chain/markets-sdk/chains'
import { createWalletClient, formatUnits, http, isAddress, parseAbi, parseEther, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'

export const runtime = 'nodejs'

const faucetAssets = ['STT', 'tUSDC'] as const
type FaucetAsset = (typeof faucetAssets)[number]

const defaultFaucetAmount: Record<FaucetAsset, string> = {
  STT: '1',
  tUSDC: '100',
}

const faucetDecimals: Record<FaucetAsset, number> = {
  STT: 18,
  tUSDC: 6,
}

const testUsdcAddress = SOMNIA_TESTNET_ADDRESSES.testUsdc as `0x${string}`
const testUsdcAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function faucet(uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

const faucetBodySchema = z.object({
  address: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  requester: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  requesterAddress: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  asset: z
    .preprocess((value) => {
      if (typeof value !== 'string') return value
      if (value.toLowerCase() === 'tusdc') return 'tUSDC'
      if (value.toLowerCase() === 'stt') return 'STT'

      return value
    }, z.enum(faucetAssets))
    .default('STT'),
  amount: z.coerce.string().optional(),
}).transform((body, ctx) => {
  const requester = body.address ?? body.requester ?? body.requesterAddress

  if (!requester || !isAddress(requester)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Requester address must be a valid EVM address',
    })
    return z.NEVER
  }

  const amount = body.amount ?? defaultFaucetAmount[body.asset]

  try {
    const rawAmount =
      body.asset === 'STT' ? parseEther(amount) : parseUnits(amount, faucetDecimals[body.asset])

    if (rawAmount <= BigInt(0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Faucet amount must be greater than 0',
      })
      return z.NEVER
    }

    return {
      requester,
      asset: body.asset,
      amount,
      rawAmount,
    }
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Faucet amount must be a valid decimal amount',
    })
    return z.NEVER
  }
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parseResult = faucetBodySchema.safeParse(body)

  if (!parseResult.success) {
    return Response.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten().formErrors,
      },
      { status: 400 }
    )
  }

  const { requester, asset, amount, rawAmount } = parseResult.data
  const admin = privateKeyToAccount(env.SOMNIA_PRIVATE_KEY as `0x${string}`)
  const walletClient = createWalletClient({
    account: admin,
    chain: somniaShannon,
    transport: http(),
  })

  try {
    if (asset === 'tUSDC') {
      const adminBalance = await publicClient.readContract({
        address: testUsdcAddress,
        abi: testUsdcAbi,
        functionName: 'balanceOf',
        args: [admin.address],
      })
      let mintHash: `0x${string}` | undefined

      if (adminBalance < rawAmount) {
        mintHash = await walletClient.writeContract({
          address: testUsdcAddress,
          abi: testUsdcAbi,
          functionName: 'faucet',
          args: [rawAmount - adminBalance],
        })
        await publicClient.waitForTransactionReceipt({ hash: mintHash })
      }

      const hash = await walletClient.writeContract({
        address: testUsdcAddress,
        abi: testUsdcAbi,
        functionName: 'transfer',
        args: [requester, rawAmount],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      return Response.json({
        hash,
        mintHash,
        requester,
        token: testUsdcAddress,
        amount: formatUnits(rawAmount, faucetDecimals[asset]),
        symbol: asset,
        chainId: somniaShannon.id,
        status: receipt.status,
      })
    }

    const hash = await walletClient.sendTransaction({
      to: requester,
      value: rawAmount,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    return Response.json({
      hash,
      requester,
      amount,
      symbol: asset,
      chainId: somniaShannon.id,
      status: receipt.status,
    })
  } catch (error) {
    console.error('Faucet transfer failed:', error)

    return Response.json(
      {
        error: 'Faucet transfer failed',
        details: errorMessage(error),
        requester,
        asset,
      },
      { status: 500 }
    )
  }
}
