import NumberFlow from '@number-flow/react'
import { BPM_TIMING } from './constants'

export default function BpmReadout({
  bpm,
  reduceMotion,
  size = 'chip',
}: {
  bpm: number | null
  reduceMotion: boolean
  size?: 'chip' | 'pane'
}) {
  const valueClass =
    size === 'pane' ? 'font-abc-gravity-italic text-[28px] leading-none' : 'font-sans text-xs font-medium tabular-nums'

  return (
    <span
      className={
        size === 'pane'
          ? 'inline-flex items-end gap-1.5'
          : 'inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-sans text-xs font-medium tabular-nums text-white'
      }
      style={size === 'pane' ? { fontVariantNumeric: 'tabular-nums', lineHeight: 0.85 } : undefined}
    >
      {bpm == null ? (
        <span className={`${valueClass} text-white/45`}>—</span>
      ) : (
        <NumberFlow
          value={bpm}
          animated={!reduceMotion}
          className={valueClass}
          transformTiming={BPM_TIMING}
          spinTiming={BPM_TIMING}
          opacityTiming={{ duration: 150, easing: BPM_TIMING.easing }}
        />
      )}
      <span className={size === 'pane' ? 'mb-0.5 font-sans text-xs text-white/55' : 'text-white/55'}>BPM</span>
    </span>
  )
}
