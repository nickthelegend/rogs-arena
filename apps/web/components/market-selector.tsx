'use client'

import { CoinLogo } from '@/components/coin-logo'
import { useHydrated } from '@/hooks/use-hydrated'
import { useMarketBoard, type MarketBoardEntry } from '@/hooks/use-market-board'
import { useSelectedMarket } from '@/hooks/use-market-selection'
import { formatMarketPrice } from '@/lib/format'
import type { MarketSymbol } from '@/lib/markets'
import { ROUND_OPEN, roundNumber } from '@rogs/arena-sdk'
import { cn } from 'cn'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const PANEL_WIDTH = 540
const PANEL_GAP = 14
const VIEWPORT_MARGIN = 12
/** Below this real viewport width the board opens as a bottom sheet at full size, outside the zoomed arena. */
const SHEET_BELOW = 640
const COLUMNS = 3

type Placement = { sheet: true } | { sheet: false; top: number; left: number }

function measurePlacement(trigger: HTMLElement | null): Placement {
  // The root's client width is the screen; a phone's innerWidth can be a wider layout viewport.
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  if (!trigger || viewportWidth < SHEET_BELOW) return { sheet: true }
  // CSS zoom (components/viewport-fit.tsx) keeps getBoundingClientRect in viewport pixels.
  const rect = trigger.getBoundingClientRect()
  const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left - 24), viewportWidth - PANEL_WIDTH - VIEWPORT_MARGIN)
  return { sheet: false, top: rect.bottom + PANEL_GAP, left }
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function tileStatus(entry: MarketBoardEntry, now: number) {
  if (entry.available === null) return { text: 'Checking rollup', live: false }
  if (entry.available === false) return { text: 'Opening soon', live: false }
  const round = entry.round
  if (round && round.status === ROUND_OPEN && now < round.endTs) {
    return { text: `Round ${roundNumber(round.id)} · ${clock(round.endTs - now)}`, live: true }
  }
  return { text: 'Next round rolling', live: false }
}

function MarketTile({
  entry,
  selected,
  now,
  onChoose,
  tileRef,
}: {
  entry: MarketBoardEntry
  selected: boolean
  now: number
  onChoose: (entry: MarketBoardEntry) => void
  tileRef: (element: HTMLButtonElement | null) => void
}) {
  const disabled = entry.available === false
  const status = tileStatus(entry, now)

  return (
    <button
      ref={tileRef}
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      title={entry.reason ?? `${entry.config.name} · ${entry.symbol}/USD`}
      onClick={() => onChoose(entry)}
      className={cn(
        'relative flex min-h-[100px] flex-col overflow-hidden rounded-xl p-3 text-left outline-none',
        'transition-[background-color,transform] duration-150 [transition-timing-function:var(--ease-out)]',
        'focus-visible:ring-2 focus-visible:ring-white/80',
        selected ? 'bg-black' : 'bg-white/[0.04] enabled:hover:bg-white/[0.09]',
        disabled ? 'cursor-not-allowed' : 'active:scale-[0.97]',
      )}
      style={selected ? { boxShadow: `inset 0 0 0 2px ${entry.config.color}` } : undefined}
    >
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/background-texture.webp')] bg-cover bg-center opacity-20"
        />
      ) : null}
      <span className={cn('relative flex items-center justify-between gap-2', disabled && 'opacity-50')}>
        <span className="flex items-center gap-2">
          <CoinLogo symbol={entry.symbol} className="size-5" />
          <span className="font-abc-gravity-italic text-[22px] leading-none text-white">{entry.symbol}</span>
        </span>
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{
            background: disabled ? '#3B3B3B' : entry.config.color,
            boxShadow: status.live ? `0 0 8px ${entry.config.color}` : undefined,
          }}
        />
      </span>
      <span className="relative mt-1.5 truncate text-[11px] leading-none text-[#6A7374]">{entry.config.name}</span>
      <span
        className={cn(
          'relative mt-auto pt-3 text-[15px] font-medium leading-none tabular-nums',
          disabled ? 'text-white/45' : 'text-white',
        )}
      >
        {formatMarketPrice(entry.price ?? undefined, entry.config.priceDecimals)}
      </span>
      <span
        className={cn(
          'relative mt-1.5 text-[11px] leading-none tabular-nums',
          status.live ? 'text-white/70' : 'text-[#6A7374]',
        )}
      >
        {status.text}
      </span>
      {disabled && entry.reason ? <span className="sr-only">{entry.reason}</span> : null}
    </button>
  )
}

/**
 * The market label in the header island. It opens a board of the nine coins with each MagicBlock oracle price,
 * the open round and whether that coin's arena is on the rollup yet. Coins without an arena are disabled.
 */
export default function MarketSelector() {
  const { symbol, select } = useSelectedMarket()
  const { entries, watchPrices, error } = useMarketBoard()
  const reduceMotion = useReducedMotion() ?? false
  const mounted = useHydrated()
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>({ sheet: true })
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<MarketSymbol, HTMLButtonElement>())

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => (open ? watchPrices() : undefined), [open, watchPrices])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => setPlacement(measurePlacement(triggerRef.current))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [open])

  const toggle = (next: boolean) => {
    // The round clocks read `now`; refresh it with the click so the board never opens on a stale second.
    setNow(Math.floor(Date.now() / 1000))
    setOpen(next)
  }

  useEffect(() => {
    if (!open) return
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [close, open])

  // Focus lands on the selected coin (or the first open one) so arrows and Enter work straight away.
  useEffect(() => {
    if (!open) return
    const target =
      entries.find((entry) => entry.symbol === symbol && entry.available !== false) ??
      entries.find((entry) => entry.available !== false)
    if (target) tileRefs.current.get(target.symbol)?.focus({ preventScroll: true })
    // Only on open: a price tick must not pull focus back while someone moves through the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const choose = (entry: MarketBoardEntry) => {
    if (entry.available === false) return
    select(entry.symbol)
    close(true)
  }

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      close(event.key === 'Escape')
      return
    }
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    const count = entries.length
    const current = entries.findIndex((entry) => tileRefs.current.get(entry.symbol) === document.activeElement)
    for (let offset = 1; offset <= count; offset++) {
      const index = (((current + step * offset) % count) + count) % count
      const candidate = entries[index]
      if (candidate && candidate.available !== false) {
        tileRefs.current.get(candidate.symbol)?.focus()
        return
      }
    }
  }

  const unavailable = entries.filter((entry) => entry.available === false).map((entry) => entry.symbol)
  const hidden = reduceMotion
    ? { opacity: 0 }
    : placement.sheet
      ? { opacity: 0, y: 24 }
      : { opacity: 0, y: -6, scale: 0.97 }
  const shown = reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }

  const board = (
    <AnimatePresence>
      {open && placement.sheet ? (
        <motion.div
          key="market-board-backdrop"
          aria-hidden
          className="fixed inset-0 z-[89] bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        />
      ) : null}
      {open ? (
        <motion.div
          key="market-board"
          ref={panelRef}
          id="market-board"
          role="menu"
          aria-label="Coin markets"
          onKeyDown={onPanelKeyDown}
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className={cn(
            'fixed z-[90] overflow-hidden rounded-2xl bg-section-background font-sans text-white',
            'shadow-[0_24px_64px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.07]',
            placement.sheet ? 'inset-x-2 bottom-2 max-h-[85dvh] overflow-y-auto' : 'origin-top-left',
          )}
          style={placement.sheet ? undefined : { top: placement.top, left: placement.left, width: PANEL_WIDTH }}
        >
          <div aria-hidden className="h-1.5 w-full bg-[url('/background-texture.webp')] bg-cover bg-center" />
          <div className="p-3">
            <div className="flex items-end justify-between gap-3 px-1 pb-3 pt-1">
              <p className="font-abc-gravity-italic text-[22px] leading-none">Pick a coin</p>
              <p className="text-right text-[11px] leading-tight text-[#6A7374]">
                5-minute UP / DOWN rounds
                <br />
                MagicBlock oracle prices
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {entries.map((entry) => (
                <MarketTile
                  key={entry.symbol}
                  entry={entry}
                  selected={entry.symbol === symbol}
                  now={now}
                  onChoose={choose}
                  tileRef={(element) => {
                    if (element) tileRefs.current.set(entry.symbol, element)
                    else tileRefs.current.delete(entry.symbol)
                  }}
                />
              ))}
            </div>
            {unavailable.length > 0 ? (
              <p className="px-1 pt-3 text-[11px] leading-snug text-[#6A7374]">
                Opening soon: {unavailable.join(', ')} {unavailable.length === 1 ? 'has' : 'have'} no arena account on
                the MagicBlock rollup yet, so {unavailable.length === 1 ? 'its rounds' : 'those rounds'} cannot be traded.
              </p>
            ) : null}
            {error ? <p className="px-1 pt-2 text-[11px] leading-snug text-[#F87171]">{error}</p> : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'market-board' : undefined}
        aria-label={`${symbol} market, switch coin`}
        data-open={open}
        onClick={() => toggle(!open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' || open) return
          event.preventDefault()
          toggle(true)
        }}
        className={cn(
          '-mx-2 -my-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 leading-none text-white outline-none',
          'transition-colors duration-150 [transition-timing-function:var(--ease-out)]',
          'hover:bg-white/10 focus-visible:bg-white/10 data-[open=true]:bg-white/10',
        )}
      >
        <CoinLogo symbol={symbol} className="size-6" />
        <span>{symbol}</span>
        <svg
          aria-hidden
          width="14"
          height="9"
          viewBox="0 0 14 9"
          fill="none"
          className={cn(
            'mt-1 shrink-0 text-white/70 transition-transform duration-200 [transition-timing-function:var(--ease-out)]',
            open && 'rotate-180',
          )}
        >
          <path d="M2 2l5 5 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {mounted ? createPortal(board, document.body) : null}
    </>
  )
}
