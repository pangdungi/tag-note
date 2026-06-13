import { useEffect, useId, useMemo, useState, startTransition } from 'react'
import {
  assignTagsToParent,
  createChildTag,
  filterTagsByMainSearch,
  type TagRow,
} from '../lib/notesApi'
import {
  canAssignTagToParent,
  displayTagName,
  getChildTags,
  normalizeTagInput,
  TAG_COLOR_COUNT,
} from '../lib/tagUtils'

type Props = {
  open: boolean
  parentTag: TagRow | null
  tags: TagRow[]
  userId: string
  onClose: () => void
  onAssigned: (rows: TagRow[]) => void
  onError?: (message: string) => void
}

export function AssignTagsToParentModal({
  open,
  parentTag,
  tags,
  userId,
  onClose,
  onAssigned,
  onError,
}: Props) {
  const titleId = useId()
  const pickSearchId = useId()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pickSearch, setPickSearch] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const assignableTags = useMemo(() => {
    if (!parentTag) return []
    return tags
      .filter((t) => canAssignTagToParent(t, parentTag.id, tags))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [parentTag, tags])

  const filteredAssignableTags = useMemo(
    () => filterTagsByMainSearch(assignableTags, pickSearch),
    [assignableTags, pickSearch],
  )

  const pickSearchActive = normalizeTagInput(pickSearch).length > 0

  const existingChildren = useMemo(() => {
    if (!parentTag) return []
    return getChildTags(parentTag.id, tags)
  }, [parentTag, tags])

  useEffect(() => {
    if (!open || !parentTag) return
    startTransition(() => {
      setSelectedIds([])
      setPickSearch('')
      setNewTagName('')
      setError(null)
      setSaving(false)
    })
  }, [open, parentTag])

  if (!open || !parentTag) return null

  const canSave =
    selectedIds.length > 0 || normalizeTagInput(newTagName).length > 0

  function toggleSelected(tagId: string) {
    setSelectedIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
      <div className="tag-manage-backdrop" aria-hidden="true" />
      <div
        className="tag-manage-dialog tag-manage-dialog--assign-tags"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            하위 태그 넣기
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="하위 태그 넣기 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>
        <div className="edit-note-modal-body tag-manage-assign-body">
          <p className="tag-manage-hint">
            <span
              className={`tag-manage-pill tag-tone-${parentTag.color_index % TAG_COLOR_COUNT}`}
            >
              {displayTagName(parentTag.name)}
            </span>
            {' '}아래에 넣을 태그를 고르거나 새로 만드세요.
          </p>

          {existingChildren.length > 0 ? (
            <div className="tag-manage-assign-section">
              <p className="tag-manage-assign-label">이미 들어 있는 태그</p>
              <ul className="tag-manage-assign-current">
                {existingChildren.map((t) => (
                  <li key={t.id}>
                    <span
                      className={`tag-manage-pill tag-tone-${t.color_index % TAG_COLOR_COUNT}`}
                    >
                      {displayTagName(t.name)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="tag-manage-assign-section">
            <div className="tag-manage-assign-label-row">
              <p className="tag-manage-assign-label">기존 태그에서 선택</p>
              {selectedIds.length > 0 ? (
                <span className="tag-manage-assign-selected-count">
                  {selectedIds.length}개 선택
                </span>
              ) : null}
            </div>
            {assignableTags.length === 0 ? (
              <p className="tag-manage-assign-empty">넣을 수 있는 독립 태그가 없습니다.</p>
            ) : (
              <>
                <div className="tag-manage-search-wrap tag-manage-assign-search-wrap">
                  <span className="sr-only">넣을 태그 검색</span>
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
                    id={pickSearchId}
                    type="search"
                    className="tag-manage-search-input"
                    value={pickSearch}
                    onChange={(e) => setPickSearch(e.target.value)}
                    placeholder="태그 이름 검색"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                {filteredAssignableTags.length === 0 ? (
                  <p className="tag-manage-assign-empty">
                    {pickSearchActive
                      ? '검색 결과가 없습니다.'
                      : '표시할 태그가 없습니다.'}
                  </p>
                ) : (
                  <ul className="tag-manage-assign-pick-list">
                    {filteredAssignableTags.map((t) => {
                      const checked = selectedIds.includes(t.id)
                      return (
                        <li key={t.id}>
                          <label className="tag-manage-assign-pick">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelected(t.id)}
                            />
                            <span
                              className={`tag-manage-pill tag-tone-${t.color_index % TAG_COLOR_COUNT}`}
                            >
                              {displayTagName(t.name)}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="composer-stack">
            <div className="composer-field">
              <label className="composer-label" htmlFor="assign-new-child-tag">
                새 하위 태그 만들기
              </label>
              <input
                id="assign-new-child-tag"
                type="text"
                className="composer-source"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="예: 소설"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {error ? <p className="composer-error">{error}</p> : null}
        </div>
        <div className="edit-note-modal-actions">
          <button type="button" className="btn" disabled={saving} onClick={() => onClose()}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--emphasis edit-note-modal-submit"
            disabled={!canSave || saving}
            onClick={() => {
              setError(null)
              setSaving(true)
              void (async () => {
                try {
                  const updated: TagRow[] = []
                  if (selectedIds.length > 0) {
                    updated.push(
                      ...(await assignTagsToParent(selectedIds, parentTag.id)),
                    )
                  }
                  const childName = normalizeTagInput(newTagName)
                  if (childName) {
                    updated.push(
                      await createChildTag(newTagName, parentTag.id, userId),
                    )
                  }
                  onAssigned(updated)
                  onClose()
                } catch (e) {
                  const message =
                    e instanceof Error
                      ? e.message
                      : '하위 태그를 넣지 못했습니다.'
                  setError(message)
                  onError?.(message)
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
