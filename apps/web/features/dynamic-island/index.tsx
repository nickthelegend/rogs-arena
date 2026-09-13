'use client'

import { useAbility } from '@/components/ability-provider'
import { useDisplayName } from '@/hooks/use-display-name'
import { useHeartRate } from '@/hooks/use-heart-rate'
import { useCurrentMarket, useMarketCountdown } from '@/hooks/use-current-market'
import { useTradeSetup } from '@/hooks/use-trade-setup'
import { useTrading } from '@/hooks/use-trading'
import { usePublishTraderHeartRate } from '@/hooks/use-traders'
import { ABILITY_ACCENT, appliedAbilityRelease, islandAbilityMarketToApply } from '@/lib/ability'
import { binaryMarketId } from '@/lib/trading'
import {
  canApplyAbilityOnIsland,
  formatBalanceLine,
  islandStageFromSetup,
  shortAddress,
  tradeSetupProgress,
  type FaucetAsset,
} from '@/lib/trade-setup'
import { traderIdentity } from '@/lib/traders'
import { useIslandStore } from '@/stores/island'
import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import AppliedTag from './applied-tag'
import BpmReadout from './bpm-readout'
import { PLAYBACK_RATE, SETUP_LABELS } from './constants'
import IslandButton from './island-button'
import IslandDropOverlay from './island-drop-overlay'
import IslandFrame from './island-frame'
import IslandName from './island-name'
import PaneTradingZone from './pane-trading-zone'
import PaneWearable from './pane-wearable'
import Spinner from './spinner'

function SetupProgress({ step }: { step: ReturnType<typeof useTradeSetup>['status']['step'] }) {
  const progress = tradeSetupProgress(step)
  const current = Math.min(Math.max(progress, 1), SETUP_LABELS.length)

  return (
    <ol className="flex w-full items-center justify-center gap-3 font-sans text-[11px] tracking-wide text-white/45">
      {SETUP_LABELS.map((label, index) => {
        const done = progress > index + 1 || progress === 5
        const active = progress === index + 1 && step !== 'ready' && step !== 'error'
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${done ? 'bg-white' : active ? 'bg-white/80' : 'bg-white/25'}`} />
            <span className={done || active ? 'text-white' : undefined}>{label}</span>
          </li>
        )
      })}
      <span className="sr-only">
        Step {current} of {SETUP_LABELS.length}
      </span>
    </ol>
  )
}

/**
 * Ability cards are enforced on-chain. A card dropped while you hold a position in the open round is attached
 * with `attach_ability` right away (before the ability lock). With no position it stays parked and rides on
 * the next buy. When the round ends, a card that made it on-chain is spent and a parked one returns to the rack.
 */
function useReleaseAppliedOnMarketEnd() {
  const { applied, bound, bindApplied, clearApplied, consumeApplied } = useAbility()
  const { market } = useCurrentMarket()
  const remaining = useMarketCountdown()
  const { attachAbility, isTrading, positionAbility } = useTrading()
  const marketId = binaryMarketId(market)
  const previousMarketIdRef = useRef<string | null>(null)
  const releasedMarketRef = useRef<string | null>(null)
  const attemptedCardRef = useRef<number | null>(null)

  useEffect(() => {
    if (!applied) {
      attemptedCardRef.current = null
      return
    }
    if (bound || isTrading || positionAbility == null) return
    if (positionAbility === applied.id) {
      bindApplied()
      return
    }
    // A position holding a different card still gets the attempt: the program rejects it with its own
    // message ("already attached"), and the card goes back to the rack instead of staying parked and
    // riding on (and failing) the next buy.
    if (attemptedCardRef.current === applied.id) return
    attemptedCardRef.current = applied.id

    const cardId = applied.id
    void attachAbility(cardId).then((sent) => {
      if (sent) bindApplied()
      else clearApplied(cardId)
    })
  }, [applied, attachAbility, bindApplied, bound, clearApplied, isTrading, positionAbility])

  useEffect(() => {
    const target = islandAbilityMarketToApply({
      previousMarketId: previousMarketIdRef.current,
      marketId,
      remainingSeconds: remaining,
    })
    if (marketId) previousMarketIdRef.current = marketId
    if (!target || !applied) return
    if (releasedMarketRef.current === target) return
    releasedMarketRef.current = target

    if (appliedAbilityRelease({ bound, playCreated: false }) === 'consume') {
      consumeApplied(applied.id)
    } else {
      clearApplied(applied.id)
    }
  }, [applied, bound, clearApplied, consumeApplied, marketId, remaining])
}

export default function SectionDynamicIsland() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const reduceMotion = useReducedMotion() ?? false
  const { ready, authenticated, user, status, balances, needs, settled, busy, start, fund, refresh } = useTradeSetup()
  const { canClaim, isClaiming, claimRewards, status: claimStatus } = useTrading()
  const heartRate = useHeartRate()
  const heartChain = usePublishTraderHeartRate(heartRate.bpm, heartRate.live)
  const { islandRef, drag, overIsland, applied, clearApplied, returning } = useAbility()
  useReleaseAppliedOnMarketEnd()
  const zone = useIslandStore((state) => state.zone)
  const setZone = useIslandStore((state) => state.setZone)
  const syncFromSetup = useIslandStore((state) => state.syncFromSetup)
  const wasHeartRateLive = useRef(false)
  const stage = islandStageFromSetup({
    authenticated,
    step: status.step,
    zone,
    address: status.address,
    settled,
  })

  useLayoutEffect(() => {
    syncFromSetup({
      authenticated,
      step: status.step,
      address: status.address,
      settled,
    })
  }, [authenticated, settled, status.address, status.step, syncFromSetup])

  const identity = user ? traderIdentity(user) : { address: status.address ?? '', name: 'Trader' }
  const { name, save } = useDisplayName(identity.address, identity.name)
  const showVideo = stage === 'unconnected' || stage === 'preparing' || stage === 'error'

  useEffect(() => {
    if (heartRate.live && !wasHeartRateLive.current) {
      setZone('information')
    }
    wasHeartRateLive.current = heartRate.live
  }, [heartRate.live, setZone])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const applyRate = () => {
      video.defaultPlaybackRate = PLAYBACK_RATE
      if (video.playbackRate !== PLAYBACK_RATE) {
        video.playbackRate = PLAYBACK_RATE
      }
    }

    applyRate()

    const events = ['loadedmetadata', 'canplay', 'play', 'playing', 'seeked'] as const
    for (const event of events) {
      video.addEventListener(event, applyRate)
    }

    void video
      .play()
      .then(applyRate)
      .catch(() => {})

    return () => {
      for (const event of events) {
        video.removeEventListener(event, applyRate)
      }
    }
  }, [showVideo])

  const faucet = (asset?: FaucetAsset) => {
    void fund(asset)
  }

  const claim = () => {
    void claimRewards().then(() => refresh())
  }

  const walletBusy = busy || isClaiming
  const feedback =
    claimStatus ??
    (heartChain.error ? { tone: 'error' as const, message: heartChain.error } : null) ??
    (status.step === 'error' ? { tone: 'error' as const, message: status.detail } : null)

  const showDrop = Boolean(drag) && !returning
  const canApply = canApplyAbilityOnIsland(stage)

  return (
    <section
      ref={islandRef}
      className="section-panel relative h-[180px] flex-none overflow-visible p-0"
      style={applied ? { boxShadow: `0 0 0 2px ${ABILITY_ACCENT}` } : undefined}
    >
      <AnimatePresence>
        {applied ? (
          <AppliedTag key={applied.id} name={applied.name} onClear={clearApplied} reduceMotion={reduceMotion} />
        ) : null}
      </AnimatePresence>

      <div className="relative h-full rounded-2xl">
        {showVideo ? (
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover object-bottom motion-reduce:hidden rounded-2xl"
            src="https://v1.pinimg.com/videos/iht/expMp4/45/05/57/45055796afda511e5c057fa25102cae2_720w.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
        ) : null}

        <AnimatePresence initial={false} mode="wait">
          {stage === 'unconnected' ? (
            <IslandFrame reduceMotion={reduceMotion} stageKey="unconnected">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setZone('information')
                    void start('guest')
                  }}
                  disabled={!ready || busy}
                  aria-busy={busy}
                  className="max-w-[440px] rounded-2xl px-8 py-5 text-white transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-wait"
                >
                  <span className="font-abc-gravity-italic text-[28px] leading-none">{status.title}</span>
                </button>
                <IslandButton
                  onClick={() => {
                    setZone('information')
                    void start('adapter')
                  }}
                  disabled={!ready || busy}
                  className="bg-white/10 text-white"
                >
                  Connect wallet
                </IslandButton>
              </div>
            </IslandFrame>
          ) : null}

          {stage === 'preparing' ? (
            <IslandFrame reduceMotion={reduceMotion} stageKey="preparing">
              <div className="flex max-w-[440px] flex-col items-center gap-2 rounded-2xl px-8 py-5 text-white">
                <span className="flex items-center justify-center gap-3">
                  <Spinner reduceMotion={reduceMotion} />
                  <span className="font-abc-gravity-italic text-[28px] leading-none">{status.title}</span>
                </span>
                <span className="line-clamp-3 max-w-[360px] text-center font-sans text-[13px] leading-snug text-white/70">
                  {status.detail}
                </span>
                <SetupProgress step={status.step} />
              </div>
            </IslandFrame>
          ) : null}

          {stage === 'error' ? (
            <IslandFrame reduceMotion={reduceMotion} stageKey="error">
              <div className="flex max-w-[440px] flex-col items-center gap-3 rounded-2xl px-8 py-5 text-white">
                <span className="font-abc-gravity-italic text-[28px] leading-none">{status.title}</span>
                <span className="line-clamp-3 max-w-[360px] text-center font-sans text-[13px] leading-snug text-[#F87171]">
                  {status.detail}
                </span>
                <IslandButton
                  onClick={() => {
                    setZone('information')
                    void start()
                  }}
                  disabled={!ready || busy}
                  busy={busy}
                  className="bg-white/15 text-white"
                >
                  Try again
                </IslandButton>
              </div>
            </IslandFrame>
          ) : null}

          {stage === 'information' ? (
            <IslandFrame reduceMotion={reduceMotion} stageKey="information">
              <div className="flex h-full w-full flex-col justify-between rounded-xl px-4 py-3 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <IslandName name={name} onSave={save} />
                    <p className="mt-2 font-sans text-xs text-white/55">
                      {status.address ? shortAddress(status.address) : identity.address || 'No wallet yet'}
                    </p>
                    {heartRate.live ? (
                      <div className="mt-2">
                        <BpmReadout bpm={heartRate.bpm} reduceMotion={reduceMotion} size="pane" />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <IslandButton onClick={() => setZone('wearable')} className="bg-white/10 text-white">
                      Wearable
                    </IslandButton>
                    <IslandButton onClick={() => setZone('trading-zone')} className="bg-white text-black">
                      Trade
                    </IslandButton>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-sans text-sm tabular-nums text-white/90">
                      {balances ? formatBalanceLine(balances) : 'Balances unavailable'}
                    </p>
                    {feedback ? (
                      <p
                        className={`mt-1 line-clamp-2 max-w-[280px] font-sans text-[12px] leading-snug ${
                          feedback.tone === 'error'
                            ? 'text-[#F87171]'
                            : feedback.tone === 'success'
                              ? 'text-white/80'
                              : 'text-white/55'
                        }`}
                      >
                        {feedback.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <IslandButton
                      onClick={claim}
                      disabled={walletBusy || !canClaim}
                      busy={isClaiming}
                      className="bg-white text-black"
                    >
                      {isClaiming ? 'Claiming' : 'Claim'}
                    </IslandButton>
                    <IslandButton
                      onClick={() => void refresh()}
                      disabled={walletBusy || !status.address}
                      busy={busy && status.step === 'checking_balances'}
                      className="bg-white/10 text-white"
                    >
                      {busy && status.step === 'checking_balances' ? 'Refreshing' : 'Refresh'}
                    </IslandButton>
                    {needs.sol || needs.chips || status.step === 'error' ? (
                      <>
                        <IslandButton
                          onClick={() => faucet('SOL')}
                          disabled={walletBusy || !status.address}
                          busy={busy && status.step === 'funding_sol'}
                        >
                          {busy && status.step === 'funding_sol' ? 'Funding SOL' : 'Faucet SOL'}
                        </IslandButton>
                        <IslandButton
                          onClick={() => faucet('CHIPS')}
                          disabled={walletBusy || !status.address}
                          busy={busy && status.step === 'claiming_chips'}
                        >
                          {busy && status.step === 'claiming_chips' ? 'Claiming chips' : 'Claim chips'}
                        </IslandButton>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </IslandFrame>
          ) : null}

          {stage === 'trading-zone' ? (
            <IslandFrame reduceMotion={reduceMotion} stageKey="trading-zone">
              <PaneTradingZone
                heartRate={heartRate}
                reduceMotion={reduceMotion}
                onBack={() => setZone('information')}
              />
            </IslandFrame>
          ) : null}

          {stage === 'wearable' ? (
            <IslandFrame reduceMotion={reduceMotion} stageKey="wearable">
              <div className="flex h-full w-full gap-2">
                <IslandButton
                  onClick={() => setZone('information')}
                  className="h-full shrink-0 bg-white/10 px-3 text-white"
                >
                  Back
                </IslandButton>
                <PaneWearable heartRate={heartRate} reduceMotion={reduceMotion} />
              </div>
            </IslandFrame>
          ) : null}
        </AnimatePresence>

        <IslandDropOverlay active={showDrop} hovering={overIsland} locked={!canApply} reduceMotion={reduceMotion} />
      </div>
    </section>
  )
}
