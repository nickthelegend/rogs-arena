export default function Spinner({ reduceMotion, className }: { reduceMotion: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full border-2 border-white/25 border-t-white ${
        reduceMotion ? '' : 'animate-spin'
      } ${className ?? 'size-5'}`}
    />
  )
}
