import { sanitizeName } from '@/lib/utils'
import { KeyboardEvent, useRef, useState } from 'react'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/utils'

export default function IslandName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const skipCommit = useRef(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const startEdit = () => {
    setDraft(name)
    setEditing(true)
  }

  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false
      return
    }

    const next = sanitizeName(draft)
    if (next) onSave(next)
    else setDraft(name)
    setEditing(false)
  }

  const cancel = () => {
    skipCommit.current = true
    setDraft(name)
    setEditing(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {editing ? (
        <input
          value={draft}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoFocus
          aria-label="Display name"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(sanitizeName(event.target.value))}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 border-b border-white/35 bg-transparent pb-0.5 font-abc-gravity-italic text-[22px] leading-none text-white caret-white outline-none"
        />
      ) : (
        <p className="min-w-0 truncate font-abc-gravity-italic text-[22px] leading-none">{name}</p>
      )}
      {editing ? (
        <span className="shrink-0 font-sans text-xs tabular-nums text-white/45">
          {draft.length}/{DISPLAY_NAME_MAX_LENGTH}
        </span>
      ) : (
        <button
          type="button"
          aria-label="Edit name"
          onClick={startEdit}
          className="shrink-0 font-sans text-xs text-white/55 transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] enabled:active:scale-[0.97]"
        >
          Edit
        </button>
      )}
    </div>
  )
}
