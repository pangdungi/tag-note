import { useId } from 'react'
import {
  noteSourceLabel,
  type NoteWithTags,
} from '../lib/notesApi'
import { displayTagName, TAG_COLOR_COUNT } from '../lib/tagUtils'
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
  loading?: boolean
  onEdit?: (note: NoteWithTags) => void
  onSourceFilter?: (sourceId: string) => void
}

export function NoteViewModal({
  open,
  onClose,
  note,
  loading = false,
  onEdit,
  onSourceFilter,
}: Props) {
  const titleId = useId()

  if (!open || !note) return null

  const tagLinks = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string; color_index: number }[]

  const sortedTags = [...tagLinks].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )

  const src = noteSourceLabel(note)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''

  return (
    <div className="tag-manage-overlay" role="presentation">
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
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            메모
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
          {sortedTags.length > 0 ? (
            <div className="note-view-modal-tags">
              {sortedTags.map((tg) => (
                <span
                  key={tg.id}
                  className={`note-board-tag-pill tag-tone-${tg.color_index % TAG_COLOR_COUNT}`}
                >
                  {displayTagName(tg.name)}
                </span>
              ))}
            </div>
          ) : null}
          <MemoBodyContent
            as="div"
            body={loading ? '' : body}
            className={`note-view-modal-text${
              !body && !loading ? ' note-view-modal-text--empty' : ''
            }`}
            emptyLabel={loading ? '불러오는 중…' : '내용 없음'}
          />
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
