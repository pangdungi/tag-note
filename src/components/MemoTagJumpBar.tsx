import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  resolveNoteTagChips,
  type NoteWithTags,
  type TagRow,
} from '../lib/notesApi'
import { formatHashtagLabel } from '../lib/tagUtils'

export type JumpTagChip = { id: string; name: string }

export function collectContextJumpTags(
  notes: NoteWithTags[],
  tagCatalog: Map<string, TagRow>,
  hideTagIds?: string[],
): JumpTagChip[] {
  const hidden = new Set(hideTagIds?.filter(Boolean) ?? [])
  const seen = new Map<string, JumpTagChip>()
  for (const note of notes) {
    for (const tg of resolveNoteTagChips(note, tagCatalog)) {
      if (hidden.has(tg.id) || seen.has(tg.id)) continue
      seen.set(tg.id, { id: tg.id, name: tg.name })
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function jumpTagsAttr(tagIds: string[]): string | undefined {
  const ids = [...new Set(tagIds.filter(Boolean))]
  return ids.length > 0 ? ids.join(' ') : undefined
}

export function scrollToMemoTag(
  root: ParentNode | null,
  tagId: string,
  cycleFrom?: Element | null,
): HTMLElement | null {
  if (!root) return null
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      `[data-jump-tags~="${CSS.escape(tagId)}"]`,
    ),
  ]
  if (nodes.length === 0) return null
  let idx = 0
  if (cycleFrom) {
    const cur = nodes.indexOf(cycleFrom as HTMLElement)
    if (cur >= 0) idx = (cur + 1) % nodes.length
  }
  const target = nodes[idx]
  target.classList.remove('memo-tag-jump-flash')
  void target.offsetWidth
  target.classList.add('memo-tag-jump-flash')
  window.setTimeout(() => {
    target.classList.remove('memo-tag-jump-flash')
  }, 900)
  target.scrollIntoView({ behavior: 'auto', block: 'start' })
  return target
}

export function firstNoteIndexWithTag(
  notes: NoteWithTags[],
  tagCatalog: Map<string, TagRow>,
  tagId: string,
  currentIndex: number,
): number {
  const matches: number[] = []
  notes.forEach((note, index) => {
    if (resolveNoteTagChips(note, tagCatalog).some((tg) => tg.id === tagId)) {
      matches.push(index)
    }
  })
  if (matches.length === 0) return currentIndex
  const pos = matches.indexOf(currentIndex)
  if (pos >= 0) return matches[(pos + 1) % matches.length] ?? matches[0]
  return matches[0] ?? currentIndex
}

export function MemoTagJumpBar({
  tags,
  activeTagIds,
  ariaLabel = '이 목록에 쓰인 태그',
  onJump,
}: {
  tags: JumpTagChip[]
  activeTagIds?: ReadonlySet<string>
  ariaLabel?: string
  onJump: (tagId: string) => void
}) {
  if (tags.length === 0) return null
  return (
    <nav className="memo-tag-jump-bar" aria-label={ariaLabel}>
      <ul className="memo-tag-jump-list">
        {tags.map((tg) => {
          const label = formatHashtagLabel(tg.name)
          if (!label) return null
          const active = Boolean(activeTagIds?.has(tg.id))
          return (
            <li key={tg.id}>
              <button
                type="button"
                className={`memo-tag-jump-chip${
                  active ? ' memo-tag-jump-chip--active' : ''
                }`}
                aria-current={active ? 'true' : undefined}
                onClick={() => onJump(tg.id)}
              >
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function FolderScrollWithTagJump({
  notes,
  tagCatalog,
  hideTagIds,
  resetKey,
  header,
  children,
}: {
  notes: NoteWithTags[]
  tagCatalog: Map<string, TagRow>
  hideTagIds?: string[]
  resetKey?: string
  header?: ReactNode
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTargetRef = useRef<HTMLElement | null>(null)
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const jumpTags = useMemo(
    () => collectContextJumpTags(notes, tagCatalog, hideTagIds),
    [notes, tagCatalog, hideTagIds],
  )

  useEffect(() => {
    lastTargetRef.current = null
    setActiveTagId(null)
  }, [resetKey])
  const activeTagIds = useMemo(
    () => (activeTagId ? new Set([activeTagId]) : undefined),
    [activeTagId],
  )

  return (
    <div className="folder-memos-view folder-memos-view--scroll">
      {header}
      <MemoTagJumpBar
        tags={jumpTags}
        activeTagIds={activeTagIds}
        onJump={(tagId) => {
          lastTargetRef.current = scrollToMemoTag(
            scrollRef.current,
            tagId,
            lastTargetRef.current,
          )
          setActiveTagId(tagId)
        }}
      />
      <div
        ref={scrollRef}
        className="folder-memos-scroll folder-memos-scroll--sheet"
      >
        {children}
      </div>
    </div>
  )
}
