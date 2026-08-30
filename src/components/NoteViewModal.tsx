import { useEffect, useId, useMemo, useRef } from 'react'
import {
  resolveNoteTagChips,
  resolveNoteSourceTitle,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput } from '../lib/tagUtils'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'
import editPencilIconUrl from '../assets/edit-pencil.png'

function formatNoteWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

type Props = {
  open: boolean
  onClose: () => void
  note: NoteWithTags | null
  notes?: NoteWithTags[]
  tagCatalog: Map<string, TagRow>
  sourceCatalog: Map<string, SourceRow>
  /** 클릭한 태그 맥락 — 제목에 표시 */
  primaryTagId?: string | null
  loading?: boolean
  onNoteChange?: (note: NoteWithTags) => void
  onEdit?: (note: NoteWithTags) => void
  onSourceFilter?: (sourceId: string) => void
  onTagFilter?: (tagId: string) => void
}

export function NoteViewModal({
  open,
  onClose,
  note,
  notes = [],
  tagCatalog,
  sourceCatalog,
  primaryTagId = null,
  loading = false,
  onNoteChange,
  onEdit,
  onSourceFilter,
  onTagFilter,
}: Props) {
  const titleId = useId()
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const queue = useMemo(() => {
    if (!note) return []
    if (notes.length === 0) return [note]
    return notes.some((item) => item.id === note.id) ? notes : [note, ...notes]
  }, [note, notes])

  const index = note ? queue.findIndex((item) => item.id === note.id) : -1
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < queue.length - 1

  function goBy(delta: number) {
    if (!onNoteChange || index < 0) return
    const next = queue[index + delta]
    if (next) onNoteChange(next)
  }

  const { titleTag, otherTags } = useMemo(() => {
    if (!note) {
      return { titleTag: null, otherTags: [] as { id: string; name: string; color_index: number }[] }
    }
    const sortedTags = [...resolveNoteTagChips(note, tagCatalog)].sort((a, b) =>
      a.name.localeCompare(b.name, 'ko'),
    )

    const resolvedPrimary =
      (primaryTagId
        ? sortedTags.find((t) => t.id === primaryTagId)
        : null) ?? sortedTags[0] ?? null

    const rest = resolvedPrimary
      ? sortedTags.filter((t) => t.id !== resolvedPrimary.id)
      : []

    return { titleTag: resolvedPrimary, otherTags: rest }
  }, [note, primaryTagId, tagCatalog])

  useEffect(() => {
    if (!open || !onNoteChange) return
    const changeNote = onNoteChange
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const next = queue[index + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (next) changeNote(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, queue, onNoteChange])

  if (!open || !note) return null

  const src = resolveNoteSourceTitle(note, sourceCatalog)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''
  const titleLabel = titleTag
    ? normalizeTagInput(titleTag.name)
    : '태그 없음'
  const showNav = queue.length > 1 && Boolean(onNoteChange)

  return (
    <div
      className="tag-manage-overlay tag-manage-overlay--view-note"
      role="presentation"
    >
      <div
        className="tag-manage-backdrop"
        aria-hidden="true"
        onClick={() => onClose()}
      />
      <div
        className="tag-manage-dialog tag-manage-dialog--view-note"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTouchStart={(event) => {
          const t = event.changedTouches[0]
          if (!t) return
          touchStart.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current
          touchStart.current = null
          const t = event.changedTouches[0]
          if (!start || !t || !showNav) return
          const dx = t.clientX - start.x
          const dy = t.clientY - start.y
          if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return
          goBy(dx < 0 ? 1 : -1)
        }}
      >
        {showNav ? (
          <button
            type="button"
            className="note-view-nav note-view-nav--prev"
            aria-label="이전 메모"
            disabled={!hasPrev}
            onClick={() => goBy(-1)}
          >
            &lt;
          </button>
        ) : null}
        {showNav ? (
          <button
            type="button"
            className="note-view-nav note-view-nav--next"
            aria-label="다음 메모"
            disabled={!hasNext}
            onClick={() => goBy(1)}
          >
            &gt;
          </button>
        ) : null}
          <div className="tag-manage-head note-view-modal-head">
            <h2 id={titleId} className="tag-manage-title note-view-modal-title">
              {titleLabel}
            </h2>
            <div className="note-view-modal-head-actions">
              {onEdit ? (
                <button
                  type="button"
                  className="note-view-edit"
                  aria-label="메모 수정"
                  title="수정"
                  disabled={loading}
                  onClick={() => {
                    onClose()
                    onEdit(note)
                  }}
                >
                  <img
                    src={editPencilIconUrl}
                    alt=""
                    className="note-view-edit-icon"
                    width={18}
                    height={18}
                    decoding="async"
                  />
                </button>
              ) : null}
              <button
                type="button"
                className="tag-manage-close"
                aria-label="메모 보기 닫기"
                onClick={() => onClose()}
              >
                ×
              </button>
            </div>
          </div>
          <div className="note-view-modal-body">
            <div className="note-view-modal-sheet">
              <MemoBodyContent
                as="div"
                body={loading ? '' : body}
                className={`note-view-modal-text${
                  !body && !loading ? ' note-view-modal-text--empty' : ''
                }`}
                emptyLabel={loading ? '불러오는 중…' : '내용 없음'}
              />
            </div>
            {otherTags.length > 0 ? (
              <div className="note-view-modal-other-tags" aria-label="함께 붙은 태그">
                {otherTags.map((tg) =>
                  onTagFilter ? (
                    <button
                      key={tg.id}
                      type="button"
                      className="note-board-tag-pill note-board-tag-pill--link"
                      onClick={() => {
                        onClose()
                        onTagFilter(tg.id)
                      }}
                    >
                      {displayTagName(tg.name)}
                    </button>
                  ) : (
                    <span key={tg.id} className="note-board-tag-pill">
                      {displayTagName(tg.name)}
                    </span>
                  ),
                )}
              </div>
            ) : null}
            <div className="note-view-modal-meta">
              {src ? (
                srcId && onSourceFilter ? (
                  <button
                    type="button"
                    className="note-view-modal-source"
                    onClick={() => {
                      onClose()
                      onSourceFilter(srcId)
                    }}
                  >
                    {displaySourceTitle(src)}
                  </button>
                ) : (
                  <span className="note-view-modal-source-static">
                    {displaySourceTitle(src)}
                  </span>
                )
              ) : null}
              <time dateTime={note.created_at}>
                {formatNoteWhen(note.created_at)}
              </time>
            </div>
          </div>
      </div>
    </div>
  )
}
