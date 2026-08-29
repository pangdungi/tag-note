import { useEffect, useId, useState } from 'react'
import {
  resolveNoteSourceTitle,
  type NoteWithTags,
  type SourceRow,
} from '../lib/notesApi'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'

const FLIP_MS = 720

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
}: {
  note: NoteWithTags | null
  loading?: boolean
  sourceCatalog: Map<string, SourceRow>
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
        <p className="tag-memos-flip-empty">이 태그의 메모가 아직 없습니다.</p>
      </div>
    )
  }
  const src = resolveNoteSourceTitle(note, sourceCatalog)
  const body = note.body?.trim() ?? ''
  return (
    <div className="tag-memos-flip-sheet">
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
}

export function TagMemosFlipModal({
  open,
  tagLabel,
  notes,
  loading,
  sourceCatalog,
  onClose,
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
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  useEffect(() => {
    if (!turn) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const delay = reduce ? 0 : FLIP_MS
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
    <div className="tag-memos-flip-overlay" role="presentation">
      <button
        type="button"
        className="tag-memos-flip-backdrop"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => onClose()}
      />
      <div
        className="tag-memos-flip-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-memos-flip-head">
          <h2 id={titleId} className="tag-memos-flip-title">
            {tagLabel}
          </h2>
          <button
            type="button"
            className="tag-memos-flip-close"
            aria-label="닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
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
            />
          </div>
          <div className="tag-memos-flip-page tag-memos-flip-page--front">
            <div className="tag-memos-flip-face tag-memos-flip-face--front">
              <PaperFace
                note={loading ? null : frontNote}
                loading={loading}
                sourceCatalog={sourceCatalog}
              />
            </div>
            <div className="tag-memos-flip-face tag-memos-flip-face--back" />
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
