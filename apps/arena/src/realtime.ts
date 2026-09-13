import type { ServerWebSocket, WebSocketHandler } from 'bun'
import { walletForToken } from './auth'
import { postChat } from './chat'
import type { Collections } from './db'
import { Presence, PRESENCE_SWEEP_MS } from './presence'
import { formatZodError, wsClientMessageSchema, type WsClientMessage } from './schemas'
import { buildSnapshot } from './snapshot'
import { getUser } from './store'
import { errorMessage } from './util'

export const ARENA_TOPIC = 'arena'
const TRADERS_MIN_INTERVAL_MS = 1_000
const WS_OPEN = 1

/** `market` is the market whose snapshot the socket last asked for; broadcasts still go to every socket. */
export type SocketData = { connId: string; sessionId: string | null; wallet: string | null; market: string }
type Socket = ServerWebSocket<SocketData>
type Publisher = { publish(topic: string, data: string): unknown }

export class RealtimeHub {
  readonly presence: Presence
  private publisher: Publisher | null = null
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private tradersTimer: ReturnType<typeof setTimeout> | null = null
  private lastTradersAt = 0

  constructor(
    private readonly cols: Collections,
    private readonly clock: () => number = Date.now,
  ) {
    this.presence = new Presence(clock)
  }

  attach(publisher: Publisher): void {
    this.publisher = publisher
  }

  start(): void {
    this.sweepTimer = setInterval(() => {
      if (this.presence.sweep()) this.tradersChanged()
    }, PRESENCE_SWEEP_MS)
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    if (this.tradersTimer) clearTimeout(this.tradersTimer)
  }

  /** Sends `{ type, ...payload }` to every client that has said hello. */
  broadcast(type: string, payload: Record<string, unknown>): void {
    this.publisher?.publish(ARENA_TOPIC, JSON.stringify({ type, ...payload }))
  }

  setProfile(wallet: string, displayName: string | null, isBot: boolean): void {
    if (this.presence.setProfile(wallet, displayName, isBot)) this.tradersChanged()
  }

  confirmHeart(wallet: string, bpm: number, at: number): void {
    if (this.presence.confirmHeart(wallet, bpm, at)) this.tradersChanged()
  }

  readonly websocket: WebSocketHandler<SocketData> = {
    maxPayloadLength: 16 * 1024,
    message: (ws, message) => {
      void this.onMessage(ws, message)
    },
    close: ws => {
      if (ws.data.sessionId && this.presence.leave(ws.data.sessionId, ws.data.connId)) this.tradersChanged()
    },
  }

  private async onMessage(ws: Socket, raw: string | Buffer): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
    } catch {
      return this.sendError(ws, 'Invalid JSON message')
    }
    const result = wsClientMessageSchema.safeParse(parsed)
    if (!result.success) return this.sendError(ws, formatZodError(result.error))
    try {
      await this.handle(ws, result.data)
    } catch (error) {
      console.error(`[ws] ${result.data.type} failed: ${errorMessage(error)}`)
      this.sendError(ws, 'Server error')
    }
  }

  private async handle(ws: Socket, message: WsClientMessage): Promise<void> {
    if (message.type === 'hello') return this.onHello(ws, message.sessionId, message.token ?? null, message.market)
    const { sessionId, wallet } = ws.data
    if (!sessionId) return this.sendError(ws, 'Send hello first')
    if (this.presence.join(sessionId, ws.data.connId, wallet)) this.tradersChanged()

    if (message.type === 'presence') return
    if (message.type === 'market') {
      ws.data.market = message.market
      return this.sendSnapshot(ws, message.market)
    }
    if (!wallet) return this.sendError(ws, message.type === 'chat' ? 'Sign in to chat' : 'Sign in to share heart rate')
    if (message.type === 'heart') {
      if (this.presence.setHeart(wallet, message.bpm)) this.tradersChanged()
      return
    }
    const result = await postChat(this.cols, { wallet, name: this.presence.nameOf(wallet), message: message.message }, this.clock)
    if (!result.ok) return this.sendError(ws, result.error)
    this.broadcast('chat', { message: result.chat })
  }

  private async onHello(ws: Socket, sessionId: string, token: string | null, market: string): Promise<void> {
    const wallet = token ? await walletForToken(this.cols, token, this.clock()) : null
    if (wallet) {
      const user = await getUser(this.cols, wallet)
      this.presence.setProfile(wallet, user?.displayName ?? null, user?.isBot ?? false)
    }
    if (ws.readyState !== WS_OPEN) return
    if (ws.data.sessionId && ws.data.sessionId !== sessionId) this.presence.leave(ws.data.sessionId, ws.data.connId)
    ws.data.sessionId = sessionId
    ws.data.wallet = wallet
    ws.data.market = market
    const changed = this.presence.join(sessionId, ws.data.connId, wallet)
    // Subscribe before building the snapshot so no broadcast falls between the two.
    ws.subscribe(ARENA_TOPIC)
    await this.sendSnapshot(ws, market)
    if (changed) this.tradersChanged()
  }

  /** Sends a market snapshot, unless the socket switched to another market while it was being built. */
  private async sendSnapshot(ws: Socket, market: string): Promise<void> {
    const snapshot = await buildSnapshot(this.cols, this.presence, market, this.clock())
    if (ws.readyState === WS_OPEN && ws.data.market === market) ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }))
  }

  private sendError(ws: Socket, error: string): void {
    if (ws.readyState === WS_OPEN) ws.send(JSON.stringify({ type: 'error', error }))
  }

  /** Coalesces trader list changes into at most one broadcast per second. */
  private tradersChanged(): void {
    if (this.tradersTimer) return
    const wait = Math.max(0, this.lastTradersAt + TRADERS_MIN_INTERVAL_MS - this.clock())
    this.tradersTimer = setTimeout(() => {
      this.tradersTimer = null
      this.lastTradersAt = this.clock()
      this.broadcast('traders', { ...this.presence.list() })
    }, wait)
  }
}
