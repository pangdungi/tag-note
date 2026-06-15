import { useId, useMemo } from 'react'
import {
  noteSourceLabel,
  type NoteWithTags,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput } from '../lib/tagUtils'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'

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
  /** 클릭한 태그 맥락 — 제목에 표시 */
  primaryTagId?: string | null
  loading?: boolean
  onEdit?: (note: NoteWithTags) => void
  onSourceFilter?: (sourceId: string) => void
  onTagFilter?: (tagId: string) => void
}

export function NoteViewModal({
  open,
  onClose,
  note,
  primaryTagId = null,
  loading = false,
  onEdit,
  onSourceFilter,
  onTagFilter,
}: Props) {
  const titleId = useId()

  const { titleTag, otherTags } = useMemo(() => {
    if (!note) {
      return { titleTag: null, otherTags: [] as { id: string; name: string; color_index: number }[] }
    }
    const tagLinks = note.note_tags
      .map((nt) => nt.tags)
      .filter(Boolean) as { id: string; name: string; color_index: number }[]

    const sortedTags = [...tagLinks].sort((a, b) =>
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
  }, [note, primaryTagId])

  if (!open || !note) return null

  const src = noteSourceLabel(note)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''
  const titleLabel = titleTag
    ? normalizeTagInput(titleTag.name)
    : '태그 없음'

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
      >
        <div className="tag-manage-head note-view-modal-head">
          <h2 id={titleId} className="tag-manage-title note-view-modal-title">
            {titleLabel}
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="메모 보기 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
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
        {onEdit ? (
          <div className="note-view-modal-actions">
            <button
              type="button"
              className="btn btn--emphasis"
              disabled={loading}
              onClick={() => {
                onClose()
                onEdit(note)
              }}
            >
              수정
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
