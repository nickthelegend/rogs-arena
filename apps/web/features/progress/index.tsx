'use client'

import { useBadgeRecord } from '@/hooks/use-badge-record'
import { useProgress } from '@/hooks/use-progress'
import { badgeRecordSummary } from '@/lib/badge-record'
import { explorerTxUrl } from '@rogs/arena-sdk'
import { progressTracks } from '@/lib/progress'
import Image from 'next/image'

const STAGE_COUNT = 4
const TRACK_COLOR = '#3B3B3B'
const FILL_COLOR = '#C8C8C8'

function DashedLine({ color }: { color: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <line
        x1="0"
        y1="50%"
        x2="100%"
        y2="50%"
        stroke={color}
        strokeWidth="3"
        strokeDasharray="8 8"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function isStageFilled(stage: number, progress: number) {
  if (progress <= 0) return false
  return stage / (STAGE_COUNT - 1) <= progress
}

function StageTrack({ value, max }: { value: number; max: number }) {
  const progress = max <= 0 ? 0 : Math.min(Math.max(value / max, 0), 1)

  return (
    <div
      className="relative flex h-2 w-full items-center"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="absolute inset-x-[3px] inset-y-0">
        <DashedLine color={TRACK_COLOR} />
        <div
          className="absolute inset-0 origin-left transition-[clip-path] duration-200 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
          style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
        >
          <DashedLine color={FILL_COLOR} />
        </div>
      </div>

      <div className="relative flex w-full items-center justify-between">
        {Array.from({ length: STAGE_COUNT }).map((_, stage) => (
          <span
            key={stage}
            className="size-2.5 rounded-full transition-colors duration-150 [transition-timing-function:ease] motion-reduce:transition-none"
            style={{ background: isStageFilled(stage, progress) ? FILL_COLOR : TRACK_COLOR }}
          />
        ))}
      </div>
    </div>
  )
}

function BadgeRecordRow() {
  const { record, save, canSave, saveToSolana } = useBadgeRecord()
  const line =
    save.phase === 'saving' ? save.step : save.phase === 'error' ? save.message : badgeRecordSummary(record)

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={`truncate font-sans text-[12px] ${save.phase === 'error' ? 'text-red-400' : 'text-white/50'}`} title={line}>
          {line}
        </span>
        {save.phase === 'saved' && (
          <span className="font-sans text-[12px] text-white/50">
            Saved by a MagicBlock Magic Action ·{' '}
            <a className="underline hover:text-white" href={explorerTxUrl(save.erSignature, 'er')} target="_blank" rel="noreferrer">
              rollup tx
            </a>
            {save.baseSignature && (
              <>
                {' · '}
                <a className="underline hover:text-white" href={explorerTxUrl(save.baseSignature, 'base')} target="_blank" rel="noreferrer">
                  Solana tx
                </a>
              </>
            )}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={!canSave}
        onClick={() => void saveToSolana()}
        title={canSave ? 'Commit your player and write your badges on Solana' : 'Join the arena first to save badges'}
        className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 font-sans text-[12px] font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {save.phase === 'saving' ? 'Saving…' : 'Save to Solana'}
      </button>
    </div>
  )
}

export default function SectionProgress() {
  const state = useProgress()
  const tracks = progressTracks(state)

  return (
    <section className="section-panel flex-none select-none">
      {/* Content height, not h-full: a full-height list pushed the Save to Solana row over the status bar. */}
      <ul className="grid w-full grid-rows-4 gap-2">
        {tracks.map((track) => (
          <li className="flex items-center gap-3 text-white" key={track.id}>
            <div className="size-12 shrink-0 rounded-lg bg-[#C8C8C8] overflow-hidden">
              <Image src={track.icon} alt={track.name} width={48} height={48} />
            </div>
            <div className="flex w-fit min-w-0 flex-col gap-2.5 flex-1 pr-2">
              <div className="flex items-end justify-between gap-2">
                <span className="font-sans text-[14px] font-semibold">{track.name}</span>
                <span className="font-sans text-[12px] text-white/50">
                  {track.value}/{track.max}
                </span>
              </div>
              <StageTrack value={track.value} max={track.max} />
            </div>
            {/* <div className="size-12 shrink-0 rounded-lg bg-[#C8C8C8]"></div> */}
          </li>
        ))}
      </ul>
      <BadgeRecordRow />
    </section>
  )
}
