import type { NoteWithTags, TagRow } from '../lib/notesApi'
import { formatSpineLabel, formatSearchTagSpineLabel } from '../lib/tagUtils'
import { MemoBodyContent } from './MemoBodyContent'

type HomeSearchResultsRailProps = {
  parentTags: TagRow[]
  tags: TagRow[]
  bodyNotes: NoteWithTags[]
  loading: boolean
  onSelectTag: (tagId: string) => void
  onViewNote: (note: NoteWithTags, contextTagId?: string | null) => void
}

function primaryTagIdFromNote(note: NoteWithTags): string | null {
  const linked = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string }[]
  if (linked.length === 0) return null
  const sorted = [...linked].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
  return sorted[0]!.id
}

function SearchSpine({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <li className="parent-tag-spine-slot">
      <button
        type="button"
        className="parent-tag-card search-results-spine"
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        <span className="parent-tag-card-label">{label}</span>
      </button>
    </li>
  )
}

export function HomeSearchResultsRail({
  parentTags,
  tags,
  bodyNotes,
  loading,
  onSelectTag,
  onViewNote,
}: HomeSearchResultsRailProps) {
  const hasSpines = parentTags.length > 0 || tags.length > 0
  const hasPapers = bodyNotes.length > 0
  const isEmpty = !loading && !hasSpines && !hasPapers
  const showLoadingHint = loading && !hasSpines && !hasPapers

  return (
    <section
      className="parent-tag-rail-section search-results-rail-section"
      aria-label="검색 결과"
      aria-busy={loading || undefined}
    >
      {showLoadingHint ? (
        <p className="notes-hint search-results-rail-hint">검색하는 중…</p>
      ) : null}
      {isEmpty ? (
        <p className="notes-hint note-board-empty search-results-rail-hint">
          검색 결과가 없습니다.
        </p>
      ) : null}
      {!isEmpty && (hasSpines || hasPapers) ? (
        <ul className="parent-tag-rail search-results-rail">
          {parentTags.map((t) => (
            <SearchSpine
              key={`parent-${t.id}`}
              label={formatSpineLabel(t.name)}
              onClick={() => onSelectTag(t.id)}
            />
          ))}
          {tags.map((t) => (
            <SearchSpine
              key={`tag-${t.id}`}
              label={formatSearchTagSpineLabel(t.name)}
              onClick={() => onSelectTag(t.id)}
            />
          ))}
          {hasPapers ? (
            <li className="search-paper-stack-slot">
              <div className="search-paper-stack" role="list">
                {bodyNotes.map((note, index) => (
                  <div
                    key={note.id}
                    className="search-paper-item"
                    role="listitem"
                    style={{ zIndex: index + 1 }}
                  >
                    <button
                      type="button"
                      className="search-paper-sheet"
                      aria-label="메모 보기"
                      onClick={() =>
                        onViewNote(note, primaryTagIdFromNote(note))
                      }
                    >
                      <MemoBodyContent
                        as="div"
                        body={note.body ?? ''}
                        className="search-paper-sheet-body"
                        emptyLabel="내용 없음"
                      />
                    </button>
                  </div>
                ))}
              </div>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}
