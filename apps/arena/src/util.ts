export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      await task(items[index] as T, index)
    }
  })
  await Promise.all(workers)
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}

/** Runs `log` at most once per interval for a given key, to keep noisy loops readable. */
export function throttled(intervalMs: number) {
  const last = new Map<string, number>()
  return (key: string, log: () => void) => {
    const now = Date.now()
    if (now - (last.get(key) ?? 0) < intervalMs) return
    last.set(key, now)
    log()
  }
}
