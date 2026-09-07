import { useMemo, type RefObject } from 'react'
import type { TagRow } from '../lib/notesApi'
import { formatHashtagLabel, TAG_VIEW_NONE_ID } from '../lib/tagUtils'

type ListItem = {
  id: string
  label: string
  count: number
}

type Props = {
  tags: TagRow[]
  selectedId: string | null
  memoCounts: Map<string, number>
  noneCount: number
  hideNone?: boolean
  emptyHint?: string
  scrollRef: RefObject<HTMLDivElement | null>
  slotRef: (id: string, el: HTMLElement | null) => void
  onSelect: (id: string) => void
}

export function HomeTagSpiralRail({
  tags,
  selectedId,
  memoCounts,
  noneCount,
  hideNone = false,
  emptyHint,
  scrollRef,
  slotRef,
  onSelect,
}: Props) {
  const items = useMemo<ListItem[]>(() => {
    const rows = tags.map((t) => ({
      id: t.id,
      label: formatHashtagLabel(t.name),
      count: memoCounts.get(t.id) ?? 0,
    }))
    if (hideNone) return rows
    return [
      { id: TAG_VIEW_NONE_ID, label: '태그 없음', count: noneCount },
      ...rows,
    ]
  }, [tags, memoCounts, noneCount, hideNone])

  return (
    <div
      ref={scrollRef}
      className="tag-view-spiral tag-view-list"
      aria-label="태그 목록"
    >
      {items.length === 0 ? (
        <p className="notes-hint tag-view-list-empty">
          {emptyHint ?? '태그가 없습니다.'}
        </p>
      ) : null}
      {items.length > 0 ? (
      <ul className="tag-view-list-items">
        {items.map((item) => {
          const isSelected = selectedId === item.id
          return (
            <li
              key={item.id}
              ref={(el) => slotRef(item.id, el)}
              className="tag-view-list-row"
            >
              <button
                type="button"
                className={`tag-view-spiral-item tag-view-list-item${
                  isSelected ? ' tag-view-spiral-item--selected' : ''
                }`}
                aria-pressed={isSelected}
                aria-label={item.label}
                title={item.label}
                onClick={() => onSelect(item.id)}
              >
                <span className="tag-view-spiral-label">{item.label}</span>
                <span className="tag-view-spiral-count">{item.count}</span>
              </button>
            </li>
          )
        })}
      </ul>
      ) : null}
    </div>
  )
}
