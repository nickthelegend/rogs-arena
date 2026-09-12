'use client'

import { useDisplayName } from '@/hooks/use-display-name'
import { getFirebaseDatabase } from '@/lib/firebase'
import {
  ANONYMOUS_FIELD,
  PRESENCE_HEARTBEAT_MS,
  TRADERS_PATH,
  onlineTraderCount,
  parseTraders,
  traderHeartRateUpdate,
  traderIdentity,
  traderKey,
} from '@/lib/traders'
import { onDisconnect, onValue, ref, remove, set, update } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

type TradersStatus = 'loading' | 'live' | 'error'

const SESSION_STORAGE_KEY = 'rizz.traderSession'

function traderRefFor(address: string) {
  return ref(getFirebaseDatabase(), `${TRADERS_PATH}/${traderKey(address)}`)
}

function getTabSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_STORAGE_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export function useTraderPresence() {
  const { ready, authenticated, user } = usePrivy()
  const address = user?.wallet?.address || user?.id || ''
  const fallback = user ? traderIdentity(user).name : ''
  const { name } = useDisplayName(address, fallback)
  const nameRef = useRef(name)
  nameRef.current = name

  useEffect(() => {
    if (!ready) return

    const db = getFirebaseDatabase()
    const sessionId = getTabSessionId()
    const connectedRef = ref(db, '.info/connected')
    let cancelled = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let release: (() => Promise<void>) | undefined
    let writing = Promise.resolve()

    function enqueue(work: () => Promise<void>) {
      writing = writing.then(work).catch((error) => {
        console.error('Failed to update trader presence:', error)
      })
      return writing
    }

    async function write() {
      if (cancelled) return
      const now = Date.now()

      if (authenticated && address) {
        await update(traderRefFor(address), {
          address,
          name: nameRef.current || address,
          status: 'online',
          lastSeen: now,
          [`sessions/${sessionId}`]: now,
        })
        return
      }

      await set(ref(db, `${TRADERS_PATH}/${ANONYMOUS_FIELD}/${sessionId}`), now)
    }

    async function arm() {
      if (cancelled) return
      await release?.()
      release = undefined
      if (cancelled) return

      if (authenticated && address) {
        const sessionRef = ref(db, `${TRADERS_PATH}/${traderKey(address)}/sessions/${sessionId}`)
        const disconnect = onDisconnect(sessionRef)
        await disconnect.remove()
        if (cancelled) {
          await disconnect.cancel()
          return
        }
        await write()
        release = async () => {
          await disconnect.cancel()
          await remove(sessionRef)
        }
        return
      }

      const sessionRef = ref(db, `${TRADERS_PATH}/${ANONYMOUS_FIELD}/${sessionId}`)
      const disconnect = onDisconnect(sessionRef)
      await disconnect.remove()
      if (cancelled) {
        await disconnect.cancel()
        return
      }
      await write()
      release = async () => {
        await disconnect.cancel()
        await remove(sessionRef)
      }
    }

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() !== true) return
      void enqueue(arm)
    })

    heartbeat = setInterval(() => {
      void enqueue(write)
    }, PRESENCE_HEARTBEAT_MS)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void enqueue(arm)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      void enqueue(async () => {
        await release?.()
      })
    }
  }, [address, authenticated, ready])

  useEffect(() => {
    if (!ready || !authenticated || !address || !name) return

    void update(traderRefFor(address), { name }).catch((error) => {
      console.error('Failed to update trader name:', error)
    })
  }, [address, authenticated, name, ready])
}

export function usePublishTraderHeartRate(bpm: number | null, live: boolean) {
  const { ready, authenticated, user } = usePrivy()
  const address = user?.wallet?.address || user?.id || ''

  useEffect(() => {
    if (!ready || !authenticated || !address) return

    const db = getFirebaseDatabase()
    const traderRef = traderRefFor(address)
    const disconnectHeartRate = onDisconnect(ref(db, `${TRADERS_PATH}/${traderKey(address)}/heartRate`))
    const disconnectHeartRateAt = onDisconnect(ref(db, `${TRADERS_PATH}/${traderKey(address)}/heartRateAt`))

    void Promise.all([disconnectHeartRate.remove(), disconnectHeartRateAt.remove()]).catch((error) => {
      console.error('Failed to arm trader heart rate disconnect:', error)
    })

    return () => {
      void disconnectHeartRate.cancel()
      void disconnectHeartRateAt.cancel()
      void update(traderRef, traderHeartRateUpdate(null)).catch((error) => {
        console.error('Failed to clear trader heart rate:', error)
      })
    }
  }, [address, authenticated, ready])

  useEffect(() => {
    if (!ready || !authenticated || !address) return

    void update(traderRefFor(address), traderHeartRateUpdate(live ? bpm : null)).catch((error) => {
      console.error('Failed to publish trader heart rate:', error)
    })
  }, [address, authenticated, bpm, live, ready])
}

export function useTraders() {
  const [raw, setRaw] = useState<unknown>(null)
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState<TradersStatus>('loading')

  useEffect(() => {
    const unsubscribe = onValue(
      ref(getFirebaseDatabase(), TRADERS_PATH),
      (next) => {
        setRaw(next.val())
        setNow(Date.now())
        setStatus('live')
      },
      () => {
        setStatus('error')
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PRESENCE_HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [])

  const snapshot = parseTraders(raw, now)

  return {
    traders: snapshot.traders,
    anonymous: snapshot.anonymous,
    online: onlineTraderCount(snapshot, now),
    status,
    now,
  }
}
