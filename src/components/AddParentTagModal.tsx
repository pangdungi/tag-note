import { useEffect, useId, useMemo, useState, startTransition } from 'react'
import {
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
  onClose: () => void
  onPromoted: (row: TagRow) => void
  onError?: (message: string) => void
}

export function AddParentTagModal({
  open,
  allTags,
  tagParentLinks,
  onClose,
  onPromoted,
  onError,
}: Props) {
  const titleId = useId()
  const searchId = useId()
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [promotingId, setPromotingId] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setSearch('')
      setError(null)
      setPromotingId(null)
    })
  }, [open])

  if (!open) return null

  async function handlePick(tag: TagRow) {
    if (promotingId) return
    setError(null)
    setPromotingId(tag.id)
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
      setPromotingId(null)
    }
  }

  return (
    <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
      <div className="tag-manage-backdrop" aria-hidden="true" />
      <div
        className="tag-manage-dialog tag-manage-dialog--edit-tag tag-manage-dialog--assign-tags"
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
        <div className="edit-note-modal-body tag-manage-assign-body">
          <p className="tag-manage-hint">
            기존 태그를 클릭하면 메인태그(책 뷰)로 지정됩니다.
          </p>

          {candidates.length === 0 ? (
            <p className="tag-manage-hint tag-manage-assign-empty">
              메인태그로 지정할 태그가 없습니다. 이미 메인태그이거나 하위로
              연결된 태그는 제외됩니다.
            </p>
          ) : (
            <>
              <div className="tag-manage-search-wrap tag-manage-assign-search-wrap">
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
                  autoFocus
                />
              </div>

              {filteredCandidates.length === 0 ? (
                <p className="tag-manage-hint tag-manage-assign-empty">
                  {searchActive
                    ? '검색 결과가 없습니다.'
                    : '표시할 태그가 없습니다.'}
                </p>
              ) : (
                <ul
                  className="tag-manage-assign-pick-list edit-parent-tag-pick-list"
                  aria-label="메인태그 후보"
                >
                  {filteredCandidates.map((t) => {
                    const busy = promotingId === t.id
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="tag-manage-assign-pick edit-parent-tag-child-pick"
                          disabled={promotingId !== null}
                          aria-busy={busy}
                          onClick={() => void handlePick(t)}
                        >
                          <span className="tag-manage-pill edit-parent-tag-child-name">
                            {displayTagName(t.name)}
                          </span>
                          {busy ? (
                            <span className="tag-manage-assign-pick-status">
                              지정 중…
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {error ? <p className="composer-error">{error}</p> : null}
        </div>
        <div className="edit-note-modal-actions">
          <button
            type="button"
            className="btn"
            disabled={promotingId !== null}
            onClick={() => onClose()}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
