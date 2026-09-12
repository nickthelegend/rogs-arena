export { errorMessage } from './chain-error'

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'))
      return
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timeout)
      reject(signal?.reason ?? new Error('Aborted'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true
  if (typeof error === 'object' && error && 'name' in error && error.name === 'AbortError') return true
  return error instanceof Error && /aborted/i.test(error.message)
}
