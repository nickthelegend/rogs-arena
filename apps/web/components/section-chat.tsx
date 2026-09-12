'use client'

import { CHAT_MAX_LENGTH, useChat, type ChatMessage } from '@/hooks/use-chat'
import { resolveDisplayName } from '@/lib/display-name'
import { formatGmt7Hm } from '@/lib/format'
import { FramedAvatar } from '@/components/framed-avatar'
import { getAvatar, getFrame } from '@/lib/avatar'
import { traderIdentity } from '@/lib/traders'
import { usePrivy, type User } from '@privy-io/react-auth'
import { animate } from 'motion'
import { motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'

type ChatItem = {
  id: string
  avatar: string
  frame: string
  name: string
  message: string
  side: 'left' | 'right'
  t: number
}

const NEAR_BOTTOM_PX = 48
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const ENTER_DURATION = 0.2

function chatIdentity(user: User | null) {
  if (!user) return null
  const identity = traderIdentity(user, 'you')
  return {
    address: identity.address,
    name: resolveDisplayName(identity.address, identity.name),
  }
}

function isSelfMessage(message: ChatMessage, user: User | null) {
  if (!user) return false
  const keys = [user.wallet?.address, user.id]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase())
  return keys.includes(message.address.toLowerCase())
}

function toChatItem(message: ChatMessage, user: User | null): ChatItem {
  return {
    id: message.id,
    avatar: getAvatar(message.address || message.id),
    frame: getFrame(message.address || message.id),
    name: message.name,
    message: message.message,
    side: isSelfMessage(message, user) ? 'right' : 'left',
    t: message.t,
  }
}

function BubbleTail({ side }: { side: ChatItem['side'] }) {
  return (
    <figure
      className={side === 'left' ? 'absolute top-[10px] left-[-6px]' : 'absolute top-[10px] right-[-6px] scale-x-[-1]'}
    >
      <svg width="8" height="9" viewBox="0 0 8 9" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0.47 3.34927L5.58321 0.153515C6.24925 -0.262765 7.1132 0.216078 7.1132 1.00151V7.39302C7.1132 8.17845 6.24925 8.6573 5.58321 8.24102L0.470001 5.04526C-0.156667 4.6536 -0.156668 3.74094 0.47 3.34927Z"
          fill="#3A3A3A"
        />
      </svg>
    </figure>
  )
}

function ChatRow({ item, enter }: { item: ChatItem; enter: boolean }) {
  const isRight = item.side === 'right'
  const reduceMotion = useReducedMotion()
  const hidden = reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px) scale(0.96)' }
  const shown = reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px) scale(1)' }

  return (
    <motion.li
      initial={enter ? hidden : false}
      animate={shown}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT }}
      className={`flex min-w-0 w-full ${isRight ? 'justify-end' : ''}`}
    >
      <div className={`flex min-w-0 max-w-full gap-4 ${isRight ? 'flex-row-reverse' : ''}`}>
        <FramedAvatar src={item.avatar} frame={item.frame} alt={item.name} className="h-12 w-12" />
        <div className="relative min-w-0 w-fit max-w-full rounded-lg bg-[#3A3A3A] p-2 text-white/80">
          <BubbleTail side={item.side} />
          <div className="flex min-w-0 w-full items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-sans text-sm font-regular text-white/50">{item.name}</span>
          </div>
          <span className="mt-1 block wrap-break-word break-words text-sm leading-[1.1]">{item.message}</span>
          <div className="mt-2 flex min-w-0 w-full items-end justify-end gap-3">
            <time
              dateTime={new Date(item.t).toISOString()}
              className="shrink-0 font-sans text-xs tabular-nums text-[#6A7374]"
            >
              {formatGmt7Hm(item.t)}
            </time>
          </div>
        </div>
      </div>
    </motion.li>
  )
}

export default function SectionChat() {
  const { ready, authenticated, user, login } = usePrivy()
  const { messages, initialIds, send } = useChat()
  const items = messages.map((message) => toChatItem(message, user ?? null))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const programmaticScrollRef = useRef(false)
  const reduceMotion = useReducedMotion()
  const latestId = messages.at(-1)?.id
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canSubmit = draft.trim().length > 0 && !sending && ready

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !stickToBottomRef.current) return

    const top = scroller.scrollHeight - scroller.clientHeight
    if (top <= 0) return

    if (reduceMotion) {
      scroller.scrollTop = top
      return
    }

    programmaticScrollRef.current = true
    const playback = animate(scroller.scrollTop, top, {
      duration: ENTER_DURATION,
      ease: EASE_OUT,
      onUpdate: (value) => {
        scroller.scrollTop = value
      },
      onComplete: () => {
        programmaticScrollRef.current = false
        stickToBottomRef.current = true
      },
    })

    return () => {
      playback.stop()
      programmaticScrollRef.current = false
    }
  }, [latestId, reduceMotion])

  return (
    <section className="section-panel flex min-h-0 flex-col gap-2 overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={(event) => {
          if (programmaticScrollRef.current) return
          const scroller = event.currentTarget
          stickToBottomRef.current =
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_BOTTOM_PX
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg hide-scrollbar"
      >
        <ul className="flex min-w-0 flex-col gap-4 px-2">
          {items.map((item) => (
            <ChatRow key={item.id} enter={Boolean(initialIds && !initialIds.has(item.id))} item={item} />
          ))}
        </ul>
      </div>

      <form
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          if (!ready || sending) return

          if (!authenticated || !user) {
            login()
            return
          }

          const identity = chatIdentity(user)
          const message = draft.trim()
          if (!identity || !message) return

          setSending(true)
          stickToBottomRef.current = true
          setDraft('')
          inputRef.current?.focus()

          try {
            await send({
              address: identity.address,
              name: identity.name,
              message,
            })
          } catch (error) {
            setDraft(message)
            console.error(error)
          } finally {
            setSending(false)
            inputRef.current?.focus()
          }
        }}
        className="flex shrink-0 items-center justify-between rounded-lg bg-[#272727]"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          autoComplete="off"
          disabled={!ready}
          className="w-full rounded-lg bg-transparent p-4 text-white/80 disabled:opacity-50"
          placeholder={authenticated ? "What's that" : 'Sign in to chat'}
        />
        <button
          type="submit"
          disabled={authenticated && !canSubmit}
          className={`p-4 transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:pointer-events-none ${
            authenticated && !canSubmit ? 'opacity-50' : 'opacity-100'
          }`}
        >
          <figure className="h-5 w-5">
            <svg
              className="h-full w-full"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15.8325 8.17463L10.109 13.9592L3.59944 9.88767C2.66675 9.30414 2.86077 7.88744 3.91572 7.57893L19.3712 3.05277C20.3373 2.76963 21.2326 3.67283 20.9456 4.642L16.3731 20.0868C16.0598 21.1432 14.6512 21.332 14.0732 20.3953L10.106 13.9602"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
            </svg>
          </figure>
        </button>
      </form>
    </section>
  )
}
