import { describe, expect, test } from 'bun:test'
import { closeSocket } from '../socket-close'

type Closed = { code: number; reason: string }

// A minimal stand-in exposing only the WebSocket fields closeSocket touches.
function socketIn(readyState: number) {
  const closed: Closed[] = []
  const socket = {
    readyState,
    onopen: (() => undefined) as (() => void) | null,
    onmessage: (() => undefined) as (() => void) | null,
    onclose: (() => undefined) as (() => void) | null,
    onerror: (() => undefined) as (() => void) | null,
    close: (code: number, reason: string) => {
      closed.push({ code, reason })
    },
  }
  return { socket, closed }
}

describe('closeSocket', () => {
  test('an open socket closes right away and stops delivering events', () => {
    const { socket, closed } = socketIn(WebSocket.OPEN)
    closeSocket(socket as never, 1000, 'client stopped')
    expect(closed).toEqual([{ code: 1000, reason: 'client stopped' }])
    expect([socket.onopen, socket.onmessage, socket.onclose, socket.onerror]).toEqual([null, null, null, null])
  })

  test('a connecting socket is closed only once its handshake completes', () => {
    const { socket, closed } = socketIn(WebSocket.CONNECTING)
    closeSocket(socket as never, 1000, 'auth changed')
    expect(closed).toEqual([])
    socket.readyState = WebSocket.OPEN
    socket.onopen?.()
    expect(closed).toEqual([{ code: 1000, reason: 'auth changed' }])
  })

  test('an already closed socket is left alone', () => {
    const { socket, closed } = socketIn(WebSocket.CLOSED)
    closeSocket(socket as never, 1000, 'client stopped')
    expect(closed).toEqual([])
  })
})
