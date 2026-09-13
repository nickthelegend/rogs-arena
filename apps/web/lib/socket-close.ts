export type ClosableSocket = Pick<WebSocket, 'readyState' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'>

const CONNECTING = 0
const OPEN = 1

/**
 * Closes a socket the caller has already detached. A socket still CONNECTING is closed as soon as it opens:
 * closing it mid-handshake makes the browser log "WebSocket is closed before the connection is established".
 */
export function closeSocket(socket: ClosableSocket, code: number, reason: string) {
  socket.onmessage = null
  socket.onclose = null
  socket.onerror = null
  if (socket.readyState === CONNECTING) {
    socket.onopen = () => socket.close(code, reason)
    return
  }
  socket.onopen = null
  if (socket.readyState === OPEN) socket.close(code, reason)
}
