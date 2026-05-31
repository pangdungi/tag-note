import { useId, useRef, useState } from 'react'
import type { SourceRow } from '../lib/notesApi'
import { filterSourcesByQuery } from '../lib/notesApi'
import { displaySourceTitle, normalizeSourceTitle, sourceTitleKey } from '../lib/sourceUtils'

function isImeHandling(e: React.KeyboardEvent): boolean {
  const ne = e.nativeEvent
  if (ne.isComposing) return true
  if ('keyCode' in ne && (ne as KeyboardEvent).keyCode === 229) return true
  return false
}

export type SelectedSource = {
  id?: string
  title: string
}

type Props = {
  allSources: SourceRow[]
  selected: SelectedSource | null
  onChange: (source: SelectedSource | null) => void
  /** 모달 푸터 위 등 — 목록이 아래로 가려질 때 위로 펼침 */
  suggestPlacement?: 'down' | 'up'
}

export function SourceComposer({
  allSources,
  selected,
  onChange,
  suggestPlacement = 'down',
}: Props) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const lastEnterAt = useRef(0)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const suggestions = filterSourcesByQuery(allSources, draft)

  function commitSource(title: string, existing?: SourceRow) {
    const label = normalizeSourceTitle(title)
    if (!label) {
      onChange(null)
      setDraft('')
      setOpen(false)
      return
    }
    if (existing) {
      onChange({ id: existing.id, title: existing.title })
    } else {
      const ref =
        allSources.find((s) => sourceTitleKey(s.title) === sourceTitleKey(label)) ??
        null
      if (ref) {
        onChange({ id: ref.id, title: ref.title })
      } else {
        onChange({ title: label })
      }
    }
    setDraft('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function commitDraftFromInput() {
    const picked =
      open && activeIndex >= 0 && activeIndex < suggestions.length
        ? suggestions[activeIndex]
        : undefined
    if (picked) {
      commitSource(picked.title, picked)
    } else {
      commitSource(draft)
    }
  }

  const inputValue = selected ? displaySourceTitle(selected.title) : draft
  const draftNormalized = normalizeSourceTitle(draft)
  const canCommitDraft =
    !selected &&
    (draftNormalized.length > 0 ||
      (open && activeIndex >= 0 && activeIndex < suggestions.length))

  return (
    <div className="composer-source-field">
      <label className="composer-label" htmlFor={listId + '-source'}>
        출처
      </label>
      <div className="source-input-row">
        <div className="source-input-shell">
          <span className="source-input-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <input
            ref={inputRef}
            id={listId + '-source'}
            type="text"
            className="composer-source source-composer-input"
            value={inputValue}
            autoComplete="off"
            spellCheck={false}
            placeholder="책, 기사 등 (선택)"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId + '-suggest'}
            onChange={(e) => {
              if (selected) {
                onChange(null)
              }
              setDraft(e.target.value)
              setActiveIndex(-1)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => {
                if (!selected && draft.trim()) {
                  commitSource(draft)
                }
                setOpen(false)
              }, 150)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (isImeHandling(e)) return
                const now = Date.now()
                if (now - lastEnterAt.current < 120) return
                lastEnterAt.current = now
                e.preventDefault()
                if (selected) return
                commitDraftFromInput()
                return
              }
              if (e.key === 'ArrowDown') {
                if (isImeHandling(e)) return
                e.preventDefault()
                setOpen(true)
                setActiveIndex((i) => {
                  if (!suggestions.length) return -1
                  if (i < 0) return 0
                  return (i + 1) % suggestions.length
                })
              }
              if (e.key === 'ArrowUp') {
                if (isImeHandling(e)) return
                e.preventDefault()
                setOpen(true)
                setActiveIndex((i) => {
                  if (!suggestions.length) return -1
                  if (i < 0) return suggestions.length - 1
                  return (i - 1 + suggestions.length) % suggestions.length
                })
              }
              if (e.key === 'Escape') {
                setOpen(false)
                setActiveIndex(-1)
              }
              if (e.key === 'Backspace' && selected && !draft) {
                onChange(null)
              }
            }}
          />
          {selected ? (
            <button
              type="button"
              className="source-composer-clear"
              aria-label="출처 제거"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                onChange(null)
                setDraft('')
                inputRef.current?.focus()
              }}
            >
              ×
            </button>
          ) : null}
          {!selected && open && draft.trim() && suggestions.length > 0 ? (
            <ul
              id={listId + '-suggest'}
              className={`source-suggest${
                suggestPlacement === 'up' ? ' source-suggest--dropup' : ''
              }`}
              role="listbox"
            >
              {suggestions.map((s, idx) => (
                <li key={s.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={activeIndex >= 0 && idx === activeIndex}
                    className={
                      activeIndex >= 0 && idx === activeIndex
                        ? 'source-suggest-item active'
                        : 'source-suggest-item'
                    }
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => commitSource(s.title, s)}
                  >
                    <span className="source-suggest-icon" aria-hidden="true">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </span>
                    {displaySourceTitle(s.title)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {!selected ? (
          <button
            type="button"
            className="btn source-input-add-btn"
            disabled={!canCommitDraft}
            aria-label="출처 확정"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => commitDraftFromInput()}
          >
            확인
          </button>
        ) : null}
      </div>
    </div>
  )
}
