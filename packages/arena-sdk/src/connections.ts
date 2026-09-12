import { Connection, PublicKey } from '@solana/web3.js'

import { DELEGATION_PROGRAM_ID, DEVNET_ENDPOINTS, PROGRAM_ID, type ArenaEndpoints } from './constants'

export type ArenaConnections = {
  base: Connection
  er: Connection
  endpoints: ArenaEndpoints
}

export function createConnections(endpoints: ArenaEndpoints = DEVNET_ENDPOINTS): ArenaConnections {
  return {
    base: new Connection(endpoints.baseRpcUrl, 'confirmed'),
    er: new Connection(endpoints.erRpcUrl, { commitment: 'confirmed', wsEndpoint: endpoints.erWsUrl }),
    endpoints,
  }
}

export type DelegationStatus = {
  isDelegated: boolean
  fqdn?: string
  delegationRecord?: { authority: string; owner: string; delegationSlot: number; lamports: number }
}

export async function getDelegationStatus(routerUrl: string, account: PublicKey): Promise<DelegationStatus> {
  const response = await fetch(routerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getDelegationStatus', params: [account.toBase58()] }),
  })
  if (!response.ok) throw new Error(`Router returned HTTP ${response.status}`)
  const body = (await response.json()) as { result?: DelegationStatus; error?: { message: string } }
  if (body.error) throw new Error(body.error.message)
  if (!body.result) throw new Error('Router returned no delegation status')
  return body.result
}

export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  { timeoutMs = 30_000, intervalMs = 500, label = 'condition' }: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  const suffix = lastError instanceof Error ? ` (last error: ${lastError.message})` : ''
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${label}${suffix}`)
}

/** Waits until the account is owned by the delegation program on base and visible on the ER. */
export async function waitForDelegation(connections: ArenaConnections, account: PublicKey, timeoutMs = 45_000, programId = PROGRAM_ID) {
  return waitFor(
    async () => {
      const [base, er] = await Promise.all([
        connections.base.getAccountInfo(account, 'confirmed'),
        connections.er.getAccountInfo(account, 'confirmed'),
      ])
      return Boolean(base?.owner.equals(DELEGATION_PROGRAM_ID) && er?.owner.equals(programId))
    },
    { timeoutMs, intervalMs: 750, label: `delegation of ${account.toBase58()}` },
  )
}

/** Waits until the account is back under the program on the base layer. */
export async function waitForUndelegation(connections: ArenaConnections, account: PublicKey, timeoutMs = 60_000, programId = PROGRAM_ID) {
  return waitFor(
    async () => {
      const base = await connections.base.getAccountInfo(account, 'confirmed')
      return Boolean(base?.owner.equals(programId))
    },
    { timeoutMs, intervalMs: 1_000, label: `undelegation of ${account.toBase58()}` },
  )
}

/** One real round-trip to an RPC endpoint, in milliseconds. */
export async function measureRtt(connection: Connection) {
  const started = performance.now()
  await connection.getSlot('processed')
  return performance.now() - started
}
