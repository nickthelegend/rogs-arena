'use client'

import { getFirebaseDatabase } from '@/lib/firebase'
import { get, limitToFirst, onValue, orderByKey, push, query, ref, remove } from 'firebase/database'
import { useEffect, useState } from 'react'

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

function isChatMessage(value: unknown): value is {
  address?: unknown
  name?: unknown
  message: string
  t: number
} {
  if (!value || typeof value !== 'object') return false

  const message = value as { message?: unknown; t?: unknown }
  return typeof message.message === 'string' && message.message.length > 0 && Number.isFinite(message.t)
}

export type SendChatInput = {
  address: string
  name: string
  message: string
}

async function trimChat() {
  const chatRef = ref(getFirebaseDatabase(), 'chat')
  const snapshot = await get(chatRef)
  const overflow = snapshot.size - CHAT_LIMIT
  if (overflow <= 0) return

  const oldest = await get(query(chatRef, orderByKey(), limitToFirst(overflow)))
  const removals: Promise<void>[] = []
  oldest.forEach((child) => {
    removals.push(remove(child.ref))
  })
  await Promise.all(removals)
}

export async function sendChatMessage(input: SendChatInput) {
  const message = input.message.trim()
  if (!message) throw new Error('Message is empty')
  if (message.length > CHAT_MAX_LENGTH) throw new Error(`Message must be ${CHAT_MAX_LENGTH} characters or fewer`)

  await push(ref(getFirebaseDatabase(), 'chat'), {
    address: input.address,
    name: input.name,
    message,
    t: Date.now(),
  })
  await trimChat()
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [initialIds, setInitialIds] = useState<Set<string> | null>(null)
  const [status, setStatus] = useState<ChatStatus>('loading')

  useEffect(() => {
    const unsubscribe = onValue(
      ref(getFirebaseDatabase(), 'chat'),
      (snapshot) => {
        const raw = snapshot.val() as Record<string, unknown> | null
        const next = raw
          ? Object.entries(raw).flatMap(([id, value]) => {
              if (!isChatMessage(value)) return []

              const address = typeof value.address === 'string' ? value.address : ''
              const name = typeof value.name === 'string' && value.name.length > 0 ? value.name : address.slice(0, 6)

              return [
                {
                  id,
                  address,
                  name,
                  message: value.message,
                  t: value.t,
                },
              ]
            })
          : []

        next.sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))
        setMessages(next)
        setStatus('live')
        setInitialIds((current) => current ?? new Set(next.map((message) => message.id)))
      },
      () => {
        setStatus('error')
      },
    )

    return unsubscribe
  }, [])

  return { messages, initialIds, status, send: sendChatMessage }
}
