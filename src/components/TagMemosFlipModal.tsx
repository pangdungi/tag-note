import { useEffect, useId, useState } from 'react'
import {
  resolveNoteSourceTitle,
  type NoteWithTags,
  type SourceRow,
} from '../lib/notesApi'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'

const SLIDE_MS = 480

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

function PaperFace({
  note,
  loading,
  sourceCatalog,
  emptyLabel = '이 태그의 메모가 아직 없습니다.',
  onEdit,
}: {
  note: NoteWithTags | null
  loading?: boolean
  sourceCatalog: Map<string, SourceRow>
  emptyLabel?: string
  onEdit?: (note: NoteWithTags) => void
}) {
  if (loading) {
    return (
      <div className="tag-memos-flip-sheet">
        <p className="tag-memos-flip-empty">불러오는 중…</p>
      </div>
    )
  }
  if (!note) {
    return (
      <div className="tag-memos-flip-sheet">
        <p className="tag-memos-flip-empty">{emptyLabel}</p>
      </div>
    )
  }
  const src = resolveNoteSourceTitle(note, sourceCatalog)
  const body = note.body?.trim() ?? ''
  const canEdit = Boolean(onEdit) && !loading
  return (
    <div
      className={`tag-memos-flip-sheet${
        canEdit ? ' tag-memos-flip-sheet--edit' : ''
      }`}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? '메모 수정' : undefined}
      onClick={() => {
        if (canEdit && note) onEdit?.(note)
      }}
      onKeyDown={(event) => {
        if (!canEdit || !note) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit?.(note)
        }
      }}
    >
      <MemoBodyContent
        as="div"
        body={body}
        className={`tag-memos-flip-text${
          !body ? ' tag-memos-flip-text--empty' : ''
        }`}
        emptyLabel="내용 없음"
      />
      <div className="tag-memos-flip-meta">
        {src ? <span>{displaySourceTitle(src)}</span> : null}
        <time dateTime={note.created_at}>{formatNoteWhen(note.created_at)}</time>
      </div>
    </div>
  )
}

type Props = {
  open: boolean
  tagLabel: string
  notes: NoteWithTags[]
  loading: boolean
  sourceCatalog: Map<string, SourceRow>
  onClose: () => void
  onEdit?: (note: NoteWithTags) => void
  emptyLabel?: string
  centered?: boolean
}

export function TagMemosFlipModal({
  open,
  tagLabel,
  notes,
  loading,
  sourceCatalog,
  onClose,
  onEdit,
  emptyLabel,
  centered = false,
}: Props) {
  const titleId = useId()
  const [index, setIndex] = useState(0)
  const [turn, setTurn] = useState<null | 'next' | 'prev'>(null)

  useEffect(() => {
    setIndex(0)
    setTurn(null)
  }, [tagLabel, open])

  useEffect(() => {
    if (notes.length === 0) {
      setIndex(0)
      return
    }
    setIndex((cur) => Math.min(cur, notes.length - 1))
  }, [notes.length])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!turn) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const delay = reduce ? 0 : SLIDE_MS
    const timer = window.setTimeout(() => {
      setIndex((cur) =>
        turn === 'next'
          ? Math.min(cur + 1, Math.max(notes.length - 1, 0))
          : Math.max(cur - 1, 0),
      )
      setTurn(null)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [turn, notes.length])

  if (!open) return null

  const count = notes.length
  const current = count > 0 ? notes[index] ?? null : null
  const nextNote = count > 0 ? notes[index + 1] ?? null : null
  const prevNote = count > 0 ? notes[index - 1] ?? null : null
  const busy = turn !== null
  const canNext = !busy && !loading && index < count - 1
  const canPrev = !busy && !loading && index > 0

  const underNote = turn === 'prev' ? current : nextNote ?? current
  const frontNote = turn === 'prev' ? prevNote : current

  return (
    <div
      className={`tag-memos-flip-overlay${
        centered ? ' tag-memos-flip-overlay--center' : ''
      }`}
      role="presentation"
      onClick={() => onClose()}
    >
      <div
        className="tag-memos-flip-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tag-memos-flip-head">
          <h2 id={titleId} className="tag-memos-flip-title">
            {tagLabel}
          </h2>
        </div>

        <div
          className={`tag-memos-flip-stage${
            turn === 'next' ? ' tag-memos-flip-stage--turn-next' : ''
          }${turn === 'prev' ? ' tag-memos-flip-stage--turn-prev' : ''}`}
        >
          <div className="tag-memos-flip-page tag-memos-flip-page--under">
            <PaperFace
              note={loading ? null : underNote}
              loading={loading}
              sourceCatalog={sourceCatalog}
              emptyLabel={emptyLabel}
              onEdit={onEdit}
            />
          </div>
          <div className="tag-memos-flip-page tag-memos-flip-page--front">
            <PaperFace
              note={loading ? null : frontNote}
              loading={loading}
              sourceCatalog={sourceCatalog}
              emptyLabel={emptyLabel}
              onEdit={onEdit}
            />
          </div>
        </div>

        <div className="tag-memos-flip-nav">
          <button
            type="button"
            className="tag-memos-flip-nav-btn"
            disabled={!canPrev}
            onClick={() => setTurn('prev')}
          >
            이전
          </button>
          <span className="tag-memos-flip-count" aria-live="polite">
            {loading || count === 0 ? '0 / 0' : `${index + 1} / ${count}`}
          </span>
          <button
            type="button"
            className="tag-memos-flip-nav-btn"
            disabled={!canNext}
            onClick={() => setTurn('next')}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  )
}
