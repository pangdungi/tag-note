import { useEffect, useId, useMemo, useState, startTransition } from 'react'
import {
  createParentTag,
  filterTagsByMainSearch,
  promoteTagToParent,
  type TagParentLink,
  type TagRow,
} from '../lib/notesApi'
import {
  canPromoteTagToParent,
  displayTagName,
  normalizeTagInput,
} from '../lib/tagUtils'

type Props = {
  open: boolean
  allTags: TagRow[]
  tagParentLinks: TagParentLink[]
  userId: string | null
  onClose: () => void
  onPromoted: (row: TagRow) => void
  onError?: (message: string) => void
}

export function AddParentTagModal({
  open,
  allTags,
  tagParentLinks,
  userId,
  onClose,
  onPromoted,
  onError,
}: Props) {
  const titleId = useId()
  const searchId = useId()
  const newTagId = useId()
  const [search, setSearch] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const candidates = useMemo(
    () =>
      allTags
        .filter((t) => canPromoteTagToParent(t, allTags, tagParentLinks))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [allTags, tagParentLinks],
  )

  const filteredCandidates = useMemo(
    () => filterTagsByMainSearch(candidates, search),
    [candidates, search],
  )

  const searchActive = normalizeTagInput(search).length > 0
  const canCreate = normalizeTagInput(newTagName).length > 0 && Boolean(userId)
  const busy = busyId !== null || creating

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setSearch('')
      setNewTagName('')
      setError(null)
      setBusyId(null)
      setCreating(false)
    })
  }, [open])

  if (!open) return null

  async function handlePick(tag: TagRow) {
    if (busy) return
    setError(null)
    setBusyId(tag.id)
    try {
      const result = await promoteTagToParent(tag.id)
      onPromoted(result.parent)
      onClose()
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : '메인태그로 지정하지 못했습니다.'
      setError(msg)
      onError?.(msg)
    } finally {
      setBusyId(null)
    }
  }

  async function handleCreate() {
    if (!canCreate || !userId || busy) return
    setError(null)
    setCreating(true)
    try {
      const row = await createParentTag(newTagName, userId, {
        existingTags: allTags,
      })
      onPromoted(row)
      onClose()
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : '메인태그를 만들지 못했습니다.'
      setError(msg)
      onError?.(msg)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
      <div className="tag-manage-backdrop" aria-hidden="true" />
      <div
        className="tag-manage-dialog tag-manage-dialog--add-parent"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            메인태그 추가
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="메인태그 추가 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>

        <div className="add-parent-tag-body">
          <div className="composer-stack add-parent-tag-new">
            <div className="composer-field">
              <label className="composer-label" htmlFor={newTagId}>
                새 메인태그 만들기
              </label>
              <input
                id={newTagId}
                type="text"
                className="composer-source"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="예: 독서"
                autoComplete="off"
                spellCheck={false}
                disabled={!userId || busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate && !busy) {
                    e.preventDefault()
                    void handleCreate()
                  }
                }}
              />
            </div>
          </div>

          <section className="add-parent-tag-section" aria-label="기존 태그 지정">
            <p className="add-parent-tag-section-label">기존 태그에서 지정</p>
            <p className="add-parent-tag-lead">
              태그를 누르면 메인태그(책 뷰)로 지정됩니다.
            </p>

            {candidates.length === 0 ? (
              <p className="add-parent-tag-empty">
                지정할 태그가 없습니다. 위에서 새로 만들거나, 이미 메인태그·하위
                태그는 제외됩니다.
              </p>
            ) : (
              <>
                <div className="tag-manage-search-wrap add-parent-tag-search">
                  <label className="sr-only" htmlFor={searchId}>
                    메인태그로 지정할 태그 검색
                  </label>
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
                    id={searchId}
                    type="search"
                    className="tag-manage-search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="태그 이름 검색"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                  />
                </div>

                {filteredCandidates.length === 0 ? (
                  <p className="add-parent-tag-empty">
                    {searchActive
                      ? '검색 결과가 없습니다.'
                      : '표시할 태그가 없습니다.'}
                  </p>
                ) : (
                  <ul className="add-parent-tag-list">
                    {filteredCandidates.map((t) => {
                      const rowBusy = busyId === t.id
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="add-parent-tag-row"
                            disabled={busy}
                            aria-busy={rowBusy}
                            onClick={() => void handlePick(t)}
                          >
                            <span className="add-parent-tag-row-label">
                              {displayTagName(t.name)}
                            </span>
                            <span className="add-parent-tag-row-action">
                              {rowBusy ? '지정 중…' : '지정'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </section>

          {error ? <p className="composer-error">{error}</p> : null}
        </div>

        <div className="edit-note-modal-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onClose()}
          >
            닫기
          </button>
          <button
            type="button"
            className="btn btn--emphasis edit-note-modal-submit"
            disabled={!canCreate || busy}
            onClick={() => void handleCreate()}
          >
            {creating ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
