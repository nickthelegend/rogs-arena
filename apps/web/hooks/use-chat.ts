'use client'

import { arenaRealtime, useArenaRealtime } from '@/lib/arena-realtime'
import { useState } from 'react'

export const CHAT_LIMIT = 50
export const CHAT_MAX_LENGTH = 280

export type ChatMessage = {
  id: string
  address: string
  name: string
  message: string
  t: number
}

type ChatStatus = 'loading' | 'live' | 'error'

export type SendChatInput = {
  address: string
  name: string
  message: string
}

/**
 * Sends over the tab's arena WebSocket and resolves once the server echoes the message back.
 * The server attaches the signed-in wallet's profile name, so `name` is not trusted from the client.
 */
export async function sendChatMessage(input: SendChatInput) {
  const message = input.message.trim()
  if (!message) throw new Error('Message is empty')
  if (message.length > CHAT_MAX_LENGTH) throw new Error(`Message must be ${CHAT_MAX_LENGTH} characters or fewer`)

  await arenaRealtime().sendChat(message, input.address)
}

export function useChat() {
  const messages: ChatMessage[] = useArenaRealtime((state) => state.chat)
  const snapshotStatus = useArenaRealtime((state) => state.snapshotStatus)
  const status: ChatStatus = snapshotStatus === 'ready' ? 'live' : snapshotStatus === 'error' ? 'error' : 'loading'
  const [initialIds, setInitialIds] = useState<Set<string> | null>(null)

  if (initialIds == null && status === 'live') {
    setInitialIds(new Set(messages.map((message) => message.id)))
  }

  return { messages, initialIds, status, send: sendChatMessage }
}
