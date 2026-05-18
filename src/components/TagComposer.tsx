import { useId, useRef, useState } from 'react'
import type { TagRow } from '../lib/notesApi'
import { displayTagName, normalizeTagInput, pickColorIndex, TAG_COLOR_COUNT } from '../lib/tagUtils'
import { filterTagsByQuery } from '../lib/notesApi'

/** 한글 등 IME 조합 중에는 Enter·화살표를 앱 로직에서 무시 */
function isImeHandling(e: React.KeyboardEvent): boolean {
  const ne = e.nativeEvent
  if (ne.isComposing) return true
  // keyCode 229: 일부 브라우저에서 조합 중·조합 직후 키 (deprecated이지만 IME 판별에 필요한 경우가 있음)
  if ('keyCode' in ne && (ne as KeyboardEvent).keyCode === 229) return true
  return false
}

export type SelectedTag = {
  id?: string
  name: string
  color_index: number
}

type Props = {
  allTags: TagRow[]
  selected: SelectedTag[]
  onChange: (tags: SelectedTag[]) => void
}

export function TagComposer({ allTags, selected, onChange }: Props) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const lastEnterAt = useRef(0)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  /** -1: 입력한 글자로만 확정(Enter). 0 이상: 화살표로 고른 제안만 Enter로 확정 */
  const [activeIndex, setActiveIndex] = useState(-1)

  const excludeIds = selected.map((s) => s.id).filter(Boolean) as string[]
  const suggestions = filterTagsByQuery(allTags, draft, excludeIds).slice(0, 8)

  function addTag(name: string, existing?: TagRow) {
    const label = normalizeTagInput(name)
    if (!label) return
    if (
      selected.some(
        (s) => s.name.toLowerCase() === label.toLowerCase(),
      )
    ) {
      setDraft('')
      setOpen(false)
      return
    }
    if (existing) {
      onChange([
        ...selected,
        { id: existing.id, name: existing.name, color_index: existing.color_index },
      ])
    } else {
      const ref =
        allTags.find((t) => t.name.toLowerCase() === label.toLowerCase()) ??
        null
      if (ref) {
        onChange([
          ...selected,
          {
            id: ref.id,
            name: ref.name,
            color_index: ref.color_index,
          },
        ])
      } else {
        const used = [
          ...allTags.map((t) => ({ name: t.name, color_index: t.color_index })),
          ...selected.map((s) => ({ name: s.name, color_index: s.color_index })),
        ]
        const color_index = pickColorIndex(label, used)
        onChange([...selected, { name: label, color_index }])
      }
    }
    setDraft('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function removeAt(i: number) {
    onChange(selected.filter((_, idx) => idx !== i))
  }

  function commitDraftFromInput() {
    const picked =
      open &&
      activeIndex >= 0 &&
      activeIndex < suggestions.length
        ? suggestions[activeIndex]
        : undefined
    if (picked) {
      addTag(picked.name, picked)
    } else {
      addTag(draft)
    }
  }

  const draftNormalized = normalizeTagInput(draft)
  const canCommitDraft =
    draftNormalized.length > 0 ||
    (open && activeIndex >= 0 && activeIndex < suggestions.length)

  return (
    <div className="composer-tags">
      <label className="composer-label" htmlFor={listId + '-tag'}>
        태그
      </label>
      <div className="tag-input-row">
        <div className="tag-input-shell">
          <input
            ref={inputRef}
            id={listId + '-tag'}
            type="text"
            className="tag-input"
            value={draft}
            autoComplete="off"
            spellCheck={false}
            placeholder="태그 입력 후 엔터 또는 + 추가"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId + '-suggest'}
            onChange={(e) => {
              const v = e.target.value
              setDraft(v)
              setActiveIndex(-1)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 150)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (isImeHandling(e)) return
                // 조합 확정과 Enter가 연달아 들어오며 태그가 두 번 추가되는 경우 방지
                const now = Date.now()
                if (now - lastEnterAt.current < 120) return
                lastEnterAt.current = now
                e.preventDefault()
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
            }}
          />
          {open && draft.trim() && suggestions.length > 0 ? (
            <ul id={listId + '-suggest'} className="tag-suggest" role="listbox">
              {suggestions.map((t, idx) => (
                <li key={t.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={activeIndex >= 0 && idx === activeIndex}
                    className={
                      activeIndex >= 0 && idx === activeIndex
                        ? 'tag-suggest-item active'
                        : 'tag-suggest-item'
                    }
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => addTag(t.name, t)}
                  >
                    <span className={`tag-dot tag-tone-${t.color_index % TAG_COLOR_COUNT}`} />
                    {displayTagName(t.name)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          className="btn tag-input-add-btn"
          disabled={!canCommitDraft}
          aria-label="입력한 태그 추가"
          title="엔터와 같이, 입력한 글자를 태그로 넣습니다"
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => commitDraftFromInput()}
        >
          + 추가
        </button>
      </div>
      <div className="tag-chips" role="list">
        {selected.map((t, i) => (
          <span
            key={`${t.name}-${i}`}
            className={`tag-chip tag-tone-${t.color_index % TAG_COLOR_COUNT}`}
            role="listitem"
          >
            {displayTagName(t.name)}
            <button
              type="button"
              className="tag-chip-remove"
              aria-label={`${t.name} 태그 제거`}
              onClick={() => removeAt(i)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
