import { env } from '@/env'
import { getArenaSnapshot, getCloses, getPoints, getTrades } from '@/lib/arena-api'
import {
  applyRoundData,
  applyServerMessage,
  applySnapshot,
  createArenaRealtimeStore,
  loadKey,
  parseServerMessage,
  type ArenaRealtimeState,
  type RoundDataKind,
  type RoundDataPayload,
} from '@/lib/arena-store'
import { errorMessage } from '@/lib/error'
import { PRESENCE_HEARTBEAT_MS } from '@repo/shared/firebase-path'
import { useStore } from 'zustand'

export { roundDataError, roundDataStatus, roundIdsFromMarketIds } from '@/lib/arena-store'

export const HEART_MIN_INTERVAL_MS = 2_000
export const TAB_SESSION_STORAGE_KEY = 'rogs.traderSession'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 20_000
const SHUTDOWN_GRACE_MS = 1_000
const SNAPSHOT_RETRY_MS = 10_000
const ROUND_RETRY_MS = 10_000
const CHAT_ACK_TIMEOUT_MS = 8_000
const HEART_BPM_MIN = 30
const HEART_BPM_MAX = 230

type ArenaRealtimeStore = ReturnType<typeof createArenaRealtimeStore>

let realtimeStore: ArenaRealtimeStore | null = null

export function getArenaRealtimeStore(): ArenaRealtimeStore {
  realtimeStore ??= createArenaRealtimeStore()
  return realtimeStore
}

export function useArenaRealtime<T>(selector: (state: ArenaRealtimeState) => T): T {
  return useStore(getArenaRealtimeStore(), selector)
}

type PendingChat = {
  wallet: string
  message: string
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function heartValue(bpm: number | null) {
  if (bpm == null || !Number.isFinite(bpm)) return null
  const rounded = Math.round(bpm)
  return rounded >= HEART_BPM_MIN && rounded <= HEART_BPM_MAX ? rounded : null
}

/**
 * The one WebSocket this tab keeps to the arena service. It says `hello` (with the sign-in token when there is
 * one), sends `presence` every 15 s, reconnects with backoff, and folds every server frame into the store.
 */
class ArenaRealtimeClient {
  private socket: WebSocket | null = null
  private users = 0
  private attempt = 0
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private presenceTimer: ReturnType<typeof setInterval> | null = null
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null
  private snapshotController: AbortController | null = null
  private sessionId: string | null = null
  private token: string | null = null
  private wallet: string | null = null
  private helloToken: string | null = null
  private pendingChats: PendingChat[] = []
  private heart: number | null = null
  private heartDirty = false
  private heartSentAt = 0
  private heartTimer: ReturnType<typeof setTimeout> | null = null

  retain() {
    this.users += 1
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer)
      this.shutdownTimer = null
    }
    this.open()
    this.loadSnapshot()

    let released = false
    return () => {
      if (released) return
      released = true
      this.users -= 1
      if (this.users > 0) return
      this.shutdownTimer = setTimeout(() => {
        this.shutdownTimer = null
        if (this.users === 0) this.shutdown()
      }, SHUTDOWN_GRACE_MS)
    }
  }

  setAuth(token: string | null, wallet: string | null) {
    const nextToken = token && wallet ? token : null
    const nextWallet = nextToken ? wallet : null
    if (nextToken === this.token && nextWallet === this.wallet) return

    this.token = nextToken
    this.wallet = nextWallet
    this.heart = null
    this.heartDirty = false

    const socket = this.socket
    if (!socket) return

    // The server binds a connection's identity at `hello`, so a sign-in or sign-out reopens this tab's socket.
    this.detach('Your arena sign-in changed before the server confirmed your message.')
    socket.close(1000, 'auth changed')
    this.attempt = 0
    this.open()
  }

  sendChat(message: string, address: string): Promise<void> {
    const socket = this.socket
    const wallet = this.wallet
    if (!this.token || !wallet) return Promise.reject(new Error('Sign in with your wallet to chat.'))
    if (address !== wallet) return Promise.reject(new Error('This message is not from the signed-in wallet.'))
    if (!socket || socket.readyState !== WebSocket.OPEN || this.helloToken !== this.token) {
      return Promise.reject(new Error('Chat is reconnecting to the arena server. Try again in a moment.'))
    }

    return new Promise<void>((resolve, reject) => {
      const pending: PendingChat = {
        wallet,
        message,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.dropChat(pending)
          reject(new Error('The arena server did not confirm your message.'))
        }, CHAT_ACK_TIMEOUT_MS),
      }
      this.pendingChats.push(pending)

      try {
        socket.send(JSON.stringify({ type: 'chat', message }))
      } catch (error) {
        clearTimeout(pending.timer)
        this.dropChat(pending)
        reject(new Error(`Could not send the message: ${errorMessage(error)}`))
      }
    })
  }

  /** Queues the latest bpm (null clears it). Frames go out at most once every 2 s. */
  publishHeart(bpm: number | null) {
    const value = heartValue(bpm)
    if (value === this.heart && !this.heartDirty) return
    this.heart = value
    this.heartDirty = true
    this.scheduleHeart()
  }

  requestRoundData(kind: RoundDataKind, roundId: number) {
    const store = getArenaRealtimeStore()
    const key = loadKey(kind, roundId)
    if (store.getState().loads[key]) return

    store.setState((state) => ({ loads: { ...state.loads, [key]: { status: 'loading', error: null } } }))

    const request: Promise<RoundDataPayload> =
      kind === 'trades'
        ? getTrades(roundId).then((items) => ({ kind: 'trades', roundId, items }))
        : kind === 'points'
          ? getPoints(roundId).then((items) => ({ kind: 'points', roundId, items }))
          : getCloses(roundId).then((items) => ({ kind: 'closes', roundId, items }))

    request.then(
      (payload) => {
        store.setState((state) => {
          const next = applyRoundData(state, payload)
          return { ...next, loads: { ...next.loads, [key]: { status: 'ready', error: null } } }
        })
      },
      (error: unknown) => {
        store.setState((state) => ({
          loads: {
            ...state.loads,
            [key]: { status: 'error', error: `Could not load ${kind} for round ${roundId}: ${errorMessage(error)}` },
          },
        }))
        // Dropping the failed entry lets the hooks that still need this round ask again.
        setTimeout(() => {
          store.setState((state) => {
            if (state.loads[key]?.status !== 'error') return state
            const loads = { ...state.loads }
            delete loads[key]
            return { loads }
          })
        }, ROUND_RETRY_MS)
      },
    )
  }

  private tabSessionId() {
    if (this.sessionId) return this.sessionId
    const generated = crypto.randomUUID()
    try {
      const existing = sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)
      if (existing) {
        this.sessionId = existing
        return existing
      }
      sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, generated)
    } catch {
      // Storage is blocked (private mode); the in-memory id still names this tab for its lifetime.
    }
    this.sessionId = generated
    return generated
  }

  private loadSnapshot() {
    if (this.snapshotController || this.snapshotTimer || this.users === 0) return
    const store = getArenaRealtimeStore()
    if (store.getState().snapshotStatus === 'ready') return

    const controller = new AbortController()
    this.snapshotController = controller
    getArenaSnapshot(controller.signal).then(
      (snapshot) => {
        if (this.snapshotController === controller) this.snapshotController = null
        store.setState((state) => applySnapshot(state, snapshot, Date.now()))
      },
      (error: unknown) => {
        if (this.snapshotController === controller) this.snapshotController = null
        if (controller.signal.aborted) return
        if (store.getState().snapshotStatus !== 'ready') {
          store.setState({
            snapshotStatus: 'error',
            snapshotError: `Could not load the arena snapshot: ${errorMessage(error)}`,
          })
        }
        this.snapshotTimer = setTimeout(() => {
          this.snapshotTimer = null
          this.loadSnapshot()
        }, SNAPSHOT_RETRY_MS)
      },
    )
  }

  private open() {
    if (this.socket || this.reconnectTimer || this.users === 0) return

    const store = getArenaRealtimeStore()
    const url = env.NEXT_PUBLIC_ARENA_WS_URL
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (error) {
      store.setState({ connection: 'reconnecting', connectionError: `Could not open ${url}: ${errorMessage(error)}` })
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    store.setState({ connection: this.attempt === 0 ? 'connecting' : 'reconnecting' })

    socket.onopen = () => {
      if (this.socket !== socket) return
      this.attempt = 0
      this.helloToken = this.token
      store.setState({ connection: 'open', connectionError: null })
      socket.send(
        JSON.stringify({ type: 'hello', sessionId: this.tabSessionId(), ...(this.token ? { token: this.token } : {}) }),
      )
      this.startPresence()
      if (this.heart !== null) this.heartDirty = true
      this.scheduleHeart()
    }

    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      this.receive(event.data)
    }

    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.detach('The chat connection closed before the server confirmed your message.')
      if (this.users === 0) {
        store.setState({ connection: 'idle' })
        return
      }
      const reason = event.reason ? `: ${event.reason}` : ''
      store.setState({
        connection: 'reconnecting',
        connectionError: `Realtime connection to the arena closed (code ${event.code}${reason}). Reconnecting.`,
      })
      this.scheduleReconnect()
    }
  }

  private detach(pendingChatReason: string) {
    this.socket = null
    this.helloToken = null
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer)
      this.presenceTimer = null
    }
    const pending = this.pendingChats
    this.pendingChats = []
    for (const chat of pending) {
      clearTimeout(chat.timer)
      chat.reject(new Error(pendingChatReason))
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.users === 0) return
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt) * (0.75 + Math.random() * 0.5)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private receive(data: unknown) {
    const store = getArenaRealtimeStore()
    if (typeof data !== 'string') {
      store.setState({ serverError: 'The arena server sent a binary frame; expected JSON text.' })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      store.setState({ serverError: 'The arena server sent a frame that is not valid JSON.' })
      return
    }

    const message = parseServerMessage(parsed)
    // Frame types this client does not know yet are newer server features, not errors.
    if (!message) return

    if (message.type === 'chat') this.confirmChat(message.message.address, message.message.message)
    if (message.type === 'error') this.failOldestChat(message.error)
    store.setState((state) => applyServerMessage(state, message, Date.now()))
  }

  private confirmChat(address: string, text: string) {
    const pending = this.pendingChats.find((chat) => chat.wallet === address && chat.message === text)
    if (!pending) return
    clearTimeout(pending.timer)
    this.dropChat(pending)
    pending.resolve()
  }

  private failOldestChat(error: string) {
    const pending = this.pendingChats[0]
    if (!pending) return
    clearTimeout(pending.timer)
    this.dropChat(pending)
    pending.reject(new Error(error))
  }

  private dropChat(pending: PendingChat) {
    this.pendingChats = this.pendingChats.filter((chat) => chat !== pending)
  }

  private startPresence() {
    if (this.presenceTimer) clearInterval(this.presenceTimer)
    this.presenceTimer = setInterval(() => {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: 'presence' }))
      // A steady bpm does not re-render the wearable, so refresh it before the server's 45 s freshness window ends.
      if (this.heart !== null) {
        this.heartDirty = true
        this.scheduleHeart()
      }
    }, PRESENCE_HEARTBEAT_MS)
  }

  private scheduleHeart() {
    if (this.heartTimer || !this.heartDirty) return
    const wait = Math.max(0, this.heartSentAt + HEART_MIN_INTERVAL_MS - Date.now())
    this.heartTimer = setTimeout(() => {
      this.heartTimer = null
      this.flushHeart()
    }, wait)
  }

  private flushHeart() {
    const socket = this.socket
    if (!this.heartDirty || !this.token || this.helloToken !== this.token) return
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'heart', bpm: this.heart }))
    this.heartSentAt = Date.now()
    this.heartDirty = false
  }

  private shutdown() {
    this.snapshotController?.abort()
    this.snapshotController = null
    for (const timer of [this.snapshotTimer, this.reconnectTimer, this.heartTimer]) {
      if (timer) clearTimeout(timer)
    }
    this.snapshotTimer = null
    this.reconnectTimer = null
    this.heartTimer = null

    const socket = this.socket
    this.detach('The chat connection closed before the server confirmed your message.')
    socket?.close(1000, 'client stopped')
    getArenaRealtimeStore().setState({ connection: 'idle' })
  }
}

let client: ArenaRealtimeClient | null = null

export function arenaRealtime() {
  client ??= new ArenaRealtimeClient()
  return client
}

export function requestRoundData(kind: RoundDataKind, roundId: number) {
  arenaRealtime().requestRoundData(kind, roundId)
}
