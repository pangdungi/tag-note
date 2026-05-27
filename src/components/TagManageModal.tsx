import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { EditTagModal } from './EditTagModal'
import { filterTagsByMainSearch, type TagRow } from '../lib/notesApi'
import { displayTagName, TAG_COLOR_COUNT } from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tags: TagRow[]
  onTagUpdated: (row: TagRow) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  resolveLinkedNoteIds?: (tagId: string) => string[]
  onTagError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
}

export function TagManageModal({
  open,
  onClose,
  tags,
  onTagUpdated,
  onTagDeleted,
  resolveLinkedNoteIds,
  onTagError,
  onSyncFromServer,
  onSourcesChanged,
}: Props) {
  const titleId = useId()
  const [q, setQ] = useState('')
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)

  const filtered = useMemo(() => filterTagsByMainSearch(tags, q), [tags, q])

  const closeModal = useCallback(() => {
    setQ('')
    setEditingTag(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) {
      setEditingTag(null)
    }
  }, [open])

  return (
    <>
      {open ? (
        <div className="tag-manage-overlay" role="presentation">
          <div className="tag-manage-backdrop" aria-hidden="true" />
          <div
            className="tag-manage-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="tag-manage-head">
              <h2 id={titleId} className="tag-manage-title">
                태그 관리
              </h2>
              <button
                type="button"
                className="tag-manage-close"
                aria-label="태그 관리 닫기"
                onClick={() => closeModal()}
              >
                ×
              </button>
            </div>

            <div className="tag-manage-search-wrap">
              <span className="sr-only">태그 목록 검색</span>
              <svg
                className="home-search-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                className="tag-manage-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="태그 이름 검색"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {filtered.length === 0 ? (
              <p className="tag-manage-empty">표시할 태그가 없습니다.</p>
            ) : (
              <ul className="tag-manage-list">
                {filtered.map((t) => (
                  <li key={t.id} className="tag-manage-item">
                    <button
                      type="button"
                      className="tag-manage-row-button"
                      aria-label={`${displayTagName(t.name)} 태그 수정`}
                      onClick={() => setEditingTag(t)}
                    >
                      <span
                        className={`tag-manage-pill tag-tone-${t.color_index % TAG_COLOR_COUNT}`}
                        title={displayTagName(t.name)}
                      >
                        {displayTagName(t.name)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <EditTagModal
        open={open && editingTag !== null}
        tag={editingTag}
        onClose={() => setEditingTag(null)}
        onTagUpdated={onTagUpdated}
        onTagDeleted={onTagDeleted}
        resolveLinkedNoteIds={resolveLinkedNoteIds}
        onTagError={onTagError}
        onSyncFromServer={onSyncFromServer}
        onSourcesChanged={onSourcesChanged}
      />
    </>
  )
}
