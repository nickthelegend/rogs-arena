import { errorMessage as baseErrorMessage } from '@repo/shared/error'
import { writeGasEnvelope } from '@/chain'
import { getSomniaRpcError, SomniaMempoolStatus } from '@somnia-chain/markets-sdk/native'
import { formatEther } from 'viem'

const genericRpcMessage = /missing or invalid parameters/i

const mempoolHint: Partial<Record<SomniaMempoolStatus, string>> = {
  [SomniaMempoolStatus.accountDoesNotExist]: 'fund the wallet with STT first',
  [SomniaMempoolStatus.insufficientBalance]: `wallet needs at least ${formatEther(writeGasEnvelope)} STT to cover the SDK gas envelope`,
  [SomniaMempoolStatus.hasInFlightTransactions]: 'sender already has in-flight transactions',
  [SomniaMempoolStatus.nonceTooSmall]: 'stale nonce — retry',
  [SomniaMempoolStatus.nonceTooLarge]: 'nonce is too far ahead of the account',
  [SomniaMempoolStatus.nonceNotCloseEnough]: 'nonce is too far ahead of the account',
  [SomniaMempoolStatus.invalidTransaction]: 'malformed transaction or gas below intrinsic cost',
  [SomniaMempoolStatus.invalidSignature]: 'signature did not recover to the sender',
  [SomniaMempoolStatus.mempoolFull]: 'mempool is full — retry later',
  [SomniaMempoolStatus.gasPriceBelowBaseFee]: 'maxFeePerGas is below the block base fee',
  [SomniaMempoolStatus.gasPriceBelowDynamicFee]: 'maxFeePerGas is below the node fee',
}

export function errorMessage(error: unknown) {
  const rpc = getSomniaRpcError(error)
  if (rpc) {
    const hint = rpc.mempoolStatus != null ? mempoolHint[rpc.mempoolStatus] : undefined
    const node = rpc.message.trim()
    if (node && !genericRpcMessage.test(node)) {
      return hint ? `${node} (${hint})` : node
    }
    if (hint) return hint
  }

  return baseErrorMessage(error)
}
