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

function resolveSourceFromTitle(
  title: string,
  allSources: SourceRow[],
): SelectedSource | null {
  const label = normalizeSourceTitle(title)
  if (!label) return null
  const ref =
    allSources.find((s) => sourceTitleKey(s.title) === sourceTitleKey(label)) ??
    null
  if (ref) return { id: ref.id, title: ref.title }
  return { title: label }
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
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputValue = selected ? displaySourceTitle(selected.title) : ''
  const suggestions = filterSourcesByQuery(allSources, inputValue)

  function applyTitle(raw: string) {
    onChange(resolveSourceFromTitle(raw, allSources))
    setOpen(Boolean(normalizeSourceTitle(raw)))
    setActiveIndex(-1)
  }

  function pickSource(row: SourceRow) {
    onChange({ id: row.id, title: row.title })
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

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
            onChange={(e) => applyTitle(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 150)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (isImeHandling(e)) return
                const now = Date.now()
                if (now - lastEnterAt.current < 120) return
                lastEnterAt.current = now
                e.preventDefault()
                if (
                  open &&
                  activeIndex >= 0 &&
                  activeIndex < suggestions.length
                ) {
                  pickSource(suggestions[activeIndex]!)
                }
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
              if (e.key === 'Backspace' && selected && !inputValue) {
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
                inputRef.current?.focus()
              }}
            >
              ×
            </button>
          ) : null}
          {open && inputValue.trim() && suggestions.length > 0 ? (
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
                    onClick={() => pickSource(s)}
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
      </div>
    </div>
  )
}
