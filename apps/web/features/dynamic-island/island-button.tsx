import { ReactNode } from 'react'

export default function IslandButton({
  children,
  onClick,
  disabled,
  busy,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className={`rounded-xl px-3 py-2 font-sans text-sm font-medium transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97] disabled:cursor-wait disabled:opacity-50 ${className ?? 'bg-white/10 text-white'}`}
    >
      {children}
    </button>
  )
}
