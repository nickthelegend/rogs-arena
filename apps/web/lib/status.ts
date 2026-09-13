export const RTT_SAMPLE_WINDOW = 5
export const RTT_INTERVAL_MS = 5_000
export const RTT_TIMEOUT_MS = 4_000
export const FPS_WINDOW_MS = 1_000

export function median(values: readonly number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export function pushSample(samples: readonly number[], value: number, window = RTT_SAMPLE_WINDOW) {
  return [...samples, value].slice(-window)
}

export function formatStatusReadout(rttMs: number | null, fps: number | null) {
  const rtt = rttMs == null ? '—' : String(Math.round(rttMs))
  const frames = fps == null ? '—' : String(Math.round(fps))
  return `ER RTT ${rtt} MS | ${frames} FPS`
}

/** Round-trip time of one JSON-RPC `getSlot`, including reading the response body. */
export async function measureGetSlotRtt(url: string, signal?: AbortSignal) {
  const started = performance.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json()) as { result?: unknown; error?: { message?: unknown } }
  const elapsed = performance.now() - started

  if (!response.ok) throw new Error(`getSlot answered HTTP ${response.status}`)
  if (payload.error) throw new Error(`getSlot failed: ${String(payload.error.message ?? 'unknown RPC error')}`)
  if (typeof payload.result !== 'number') throw new Error('getSlot returned no slot')
  return elapsed
}
