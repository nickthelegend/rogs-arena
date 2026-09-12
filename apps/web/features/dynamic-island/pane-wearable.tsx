import { useHeartRate } from '@/hooks/use-heart-rate'
import NumberFlow from '@number-flow/react'
import { BPM_TIMING } from './constants'
import IslandButton from './island-button'
import Spinner from './spinner'

export default function PaneWearable({
  heartRate,
  reduceMotion,
}: {
  heartRate: ReturnType<typeof useHeartRate>
  reduceMotion: boolean
}) {
  if (heartRate.status === 'unsupported') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-black/80 px-6 text-center text-white">
        <span className="font-abc-gravity-italic text-[28px] leading-none">HEART RATE</span>
        <p className="mt-3 max-w-[280px] font-sans text-[13px] leading-snug text-white/70">
          {heartRate.error ?? 'Heart rate needs Chrome or Edge.'}
        </p>
      </div>
    )
  }

  if (heartRate.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-black/80 px-6 text-center text-white">
        <span className="font-abc-gravity-italic text-[28px] leading-none">COULD NOT CONNECT</span>
        <p className="line-clamp-3 max-w-[280px] font-sans text-[13px] leading-snug text-[#F87171]">
          {heartRate.error ?? 'Could not connect to wearable.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <IslandButton
            onClick={() => void heartRate.connect()}
            busy={heartRate.busy}
            className="bg-white/15 text-white"
          >
            Try again
          </IslandButton>
          <IslandButton
            onClick={() => void heartRate.connect({ prompt: true })}
            busy={heartRate.busy}
            className="bg-white/10 text-white"
          >
            Pair a different device
          </IslandButton>
        </div>
      </div>
    )
  }

  if (heartRate.status === 'requesting' || heartRate.status === 'connecting') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-black/80 px-6 text-white">
        <span className="flex items-center justify-center gap-3">
          <Spinner reduceMotion={reduceMotion} />
          <span className="font-abc-gravity-italic text-[28px] leading-none">
            {heartRate.status === 'requesting' ? 'PAIRING' : 'CONNECTING'}
          </span>
        </span>
        <span className="font-sans text-[13px] leading-snug text-white/70">
          {heartRate.status === 'requesting'
            ? 'Pick a heart-rate monitor.'
            : heartRate.remembered
              ? `Reconnecting to ${heartRate.deviceName ?? 'your wearable'}.`
              : 'Opening the heart-rate service.'}
        </span>
      </div>
    )
  }

  if (heartRate.status === 'live') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-black/80 px-6 text-white">
        <div className="flex items-end gap-2" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 0.85 }}>
          {heartRate.bpm == null ? (
            <span className="font-abc-gravity-italic text-[42px] leading-none text-white/45">—</span>
          ) : (
            <NumberFlow
              value={heartRate.bpm}
              animated={!reduceMotion}
              className="font-abc-gravity-italic text-[42px] leading-none"
              transformTiming={BPM_TIMING}
              spinTiming={BPM_TIMING}
              opacityTiming={{ duration: 150, easing: BPM_TIMING.easing }}
            />
          )}
          <span className="mb-1 font-sans text-sm text-white/55">BPM</span>
        </div>
        <p className="font-sans text-xs text-white/55">{heartRate.deviceName ?? 'Wearable'}</p>
        {heartRate.contact === 'not-detected' ? (
          <p className="font-sans text-[12px] text-white/45">Place the sensor to read a pulse.</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <IslandButton onClick={() => void heartRate.disconnect()} className="bg-white/15 text-white">
            Disconnect
          </IslandButton>
          <IslandButton onClick={() => void heartRate.forget()} className="bg-white/10 text-white">
            Forget
          </IslandButton>
        </div>
      </div>
    )
  }

  if (heartRate.remembered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-black px-6 text-center text-white">
        <button
          type="button"
          onClick={() => void heartRate.connect()}
          disabled={heartRate.busy}
          aria-busy={heartRate.busy}
          className="flex flex-col items-center justify-center transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-wait"
        >
          <span className="font-abc-gravity-italic text-[28px] leading-none">RECONNECT</span>
          <span className="mt-2 font-sans text-xs text-white/60">{heartRate.deviceName ?? 'Saved wearable'}</span>
        </button>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <IslandButton
            onClick={() => void heartRate.connect({ prompt: true })}
            busy={heartRate.busy}
            className="bg-white/10 text-white"
          >
            Pair a different device
          </IslandButton>
          <IslandButton onClick={() => void heartRate.forget()} className="bg-white/10 text-white">
            Forget
          </IslandButton>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void heartRate.connect({ prompt: true })}
      disabled={heartRate.busy}
      aria-busy={heartRate.busy}
      className="flex flex-1 flex-col items-center justify-center rounded-xl bg-black px-6 text-white transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-wait"
    >
      <span className="font-abc-gravity-italic text-[28px] leading-none">CONNECT WEARABLE</span>
      <span className="mt-2 font-sans text-xs text-white/60">BLE heart-rate monitor</span>
    </button>
  )
}
