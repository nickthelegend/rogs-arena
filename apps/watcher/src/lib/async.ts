export { errorMessage } from '@repo/shared/error'

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }

    const timeout = setTimeout(done, ms)

    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }

    function onAbort() {
      clearTimeout(timeout)
      done()
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function waitUntilAborted(signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve()

  return new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

