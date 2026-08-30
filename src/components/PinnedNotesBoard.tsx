import { useMemo } from 'react'
import {
  buildTagCatalogMap,
  resolveNoteSourceTitle,
  resolveNoteTagChips,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import { displaySourceTitle } from '../lib/sourceUtils'
import { formatHashtagLabel } from '../lib/tagUtils'
import { MemoBodyContent } from './MemoBodyContent'

function formatNoteWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

type Props = {
  notes: NoteWithTags[]
  loading: boolean
  error: string | null
  allTags: TagRow[]
  allSources: SourceRow[]
  onBack: () => void
  onOpenNote: (note: NoteWithTags) => void
}

export function PinnedNotesBoard({
  notes,
  loading,
  error,
  allTags,
  allSources,
  onBack,
  onOpenNote,
}: Props) {
  const tagCatalog = useMemo(() => buildTagCatalogMap(allTags), [allTags])

  return (
    <div className="pinned-notes-board">
      <header className="pinned-notes-board-head">
        <button
          type="button"
          className="home-hub-back"
          onClick={onBack}
        >
          뒤로
        </button>
        <h1 className="pinned-notes-board-title">고정된 메모</h1>
      </header>
      {error ? (
        <p className="pinned-notes-board-status" role="alert">
          {error}
        </p>
      ) : null}
      {loading && notes.length === 0 ? (
        <p className="pinned-notes-board-status">불러오는 중…</p>
      ) : null}
      {!loading && notes.length === 0 && !error ? (
        <p className="pinned-notes-board-status">
          고정한 메모가 없어요. 메모를 연 뒤 수정에서 고정하기를 켜 주세요.
        </p>
      ) : null}
      {notes.length > 0 ? (
        <div className="pinned-notes-masonry">
          {notes.map((note) => {
            const chips = resolveNoteTagChips(note, tagCatalog)
            const source = resolveNoteSourceTitle(note, allSources)
            return (
              <button
                key={note.id}
                type="button"
                className="pinned-notes-card"
                onClick={() => onOpenNote(note)}
              >
                <MemoBodyContent
                  as="div"
                  body={note.body ?? ''}
                  className="pinned-notes-card-body"
                />
                {chips.length > 0 ? (
                  <p className="pinned-notes-card-tags">
                    {chips.map((t) => formatHashtagLabel(t.name)).join(' ')}
                  </p>
                ) : null}
                <div className="pinned-notes-card-meta">
                  {source ? (
                    <span>{displaySourceTitle(source)}</span>
                  ) : null}
                  <time dateTime={note.created_at}>
                    {formatNoteWhen(note.created_at)}
                  </time>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
