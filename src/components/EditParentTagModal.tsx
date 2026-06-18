import { useEffect, useId, useMemo, useRef, useState, startTransition } from 'react'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteParentTag,
  filterTagsByMainSearch,
  syncParentTagChildren,
  updateTag,
  type TagParentLink,
  type TagRow,
} from '../lib/notesApi'
import {
  displayTagName,
  applyParentChildrenSelection,
  getChildTagPickCandidates,
  getChildTags,
  normalizeTagInput,
} from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tag: TagRow | null
  tags: TagRow[]
  tagParentLinks: TagParentLink[]
  onTagUpdated: (row: TagRow) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  onChildrenSynced?: (payload: {
    tags: TagRow[]
    links: TagParentLink[]
  }) => void
  onTagError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((id) => setA.has(id))
}

export function EditParentTagModal({
  open,
  onClose,
  tag,
  tags,
  tagParentLinks,
  onTagUpdated,
  onTagDeleted,
  onChildrenSynced,
  onTagError,
  onSyncFromServer,
  onSourcesChanged,
}: Props) {
  const titleId = useId()
  const pickSearchId = useId()
  const [name, setName] = useState('')
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [initialChildIds, setInitialChildIds] = useState<string[]>([])
  const [pickSearch, setPickSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const wasOpenRef = useRef(false)

  const links = tagParentLinks

  const pickCandidates = useMemo(() => {
    if (!tag) return []
    return getChildTagPickCandidates(tag.id, tags, links)
  }, [tag, tags, links])

  const currentChildren = useMemo(() => {
    const selected = new Set(selectedChildIds)
    return tags
      .filter((t) => selected.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [selectedChildIds, tags])

  const addCandidates = useMemo(() => {
    const selected = new Set(selectedChildIds)
    return pickCandidates.filter((t) => !selected.has(t.id))
  }, [pickCandidates, selectedChildIds])

  const filteredAddCandidates = useMemo(
    () => filterTagsByMainSearch(addCandidates, pickSearch),
    [addCandidates, pickSearch],
  )

  useEffect(() => {
    if (!open || !tag) {
      wasOpenRef.current = false
      return
    }
    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true
    if (!justOpened) return

    const childIds = getChildTags(tag.id, tags, links).map((c) => c.id)
    startTransition(() => {
      setName(tag.name)
      setSelectedChildIds(childIds)
      setInitialChildIds(childIds)
      setPickSearch('')
      setError(null)
      setDeleteConfirmOpen(false)
      setSaving(false)
    })
  }, [open, tag, tags, links])

  if (!open || !tag) return null

  const nameChanged = normalizeTagInput(name) !== normalizeTagInput(tag.name)
  const childrenChanged = !sameIdSet(selectedChildIds, initialChildIds)
  const canSave =
    (normalizeTagInput(name).length > 0 && nameChanged) || childrenChanged

  function toggleChild(tagId: string) {
    setSelectedChildIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <>
      <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
        <div className="tag-manage-backdrop" aria-hidden="true" />
        <div
          className="tag-manage-dialog tag-manage-dialog--edit-tag tag-manage-dialog--edit-parent"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="tag-manage-head">
            <h2 id={titleId} className="tag-manage-title">
              상위태그 수정
            </h2>
            <button
              type="button"
              className="tag-manage-close"
              aria-label="상위태그 수정 닫기"
              onClick={() => onClose()}
            >
              ×
            </button>
          </div>
          <div className="edit-note-modal-body edit-parent-tag-body">
            <div className="composer-stack">
              <div className="composer-field">
                <label className="composer-label" htmlFor="edit-parent-tag-name">
                  상위태그 이름
                </label>
                <input
                  id="edit-parent-tag-name"
                  type="text"
                  className="composer-source"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="상위태그 이름"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>

            <section
              className="edit-parent-tag-children"
              aria-label="현재 하위 태그"
            >
              <div className="tag-manage-assign-label-row">
                <h3 className="edit-parent-tag-children-title">현재 하위 태그</h3>
                {currentChildren.length > 0 ? (
                  <span className="tag-manage-assign-selected-count">
                    {currentChildren.length}개
                  </span>
                ) : null}
              </div>

              {currentChildren.length === 0 ? (
                <p className="tag-manage-hint edit-parent-tag-children-empty">
                  하위 태그 없음
                </p>
              ) : (
                <ul className="edit-parent-tag-child-list">
                  {currentChildren.map((child) => (
                    <li key={child.id} className="edit-parent-tag-child-row">
                      <label className="tag-manage-assign-pick edit-parent-tag-child-pick">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleChild(child.id)}
                          disabled={saving}
                          aria-label={`${displayTagName(child.name)} 선택 해제`}
                        />
                        <span className="tag-manage-pill edit-parent-tag-child-name">
                          {displayTagName(child.name)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="edit-parent-tag-children edit-parent-tag-children--add"
              aria-label="하위 태그 추가"
            >
              <div className="tag-manage-assign-label-row">
                <h3 className="edit-parent-tag-children-title">하위 태그 추가</h3>
                {addCandidates.length > 0 && filteredAddCandidates.length > 0 ? (
                  <span className="tag-manage-assign-selected-count">
                    {addCandidates.length}개 후보
                  </span>
                ) : null}
              </div>

              {addCandidates.length === 0 ? (
                <p className="tag-manage-hint edit-parent-tag-children-empty">
                  없음
                </p>
              ) : (
                <>
                  <div className="tag-manage-search-wrap tag-manage-assign-search-wrap">
                    <span className="sr-only">추가할 하위 태그 검색</span>
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
                    />
                  </div>
                  {filteredAddCandidates.length === 0 ? (
                    <p className="tag-manage-assign-empty">없음</p>
                  ) : (
                    <ul className="tag-manage-assign-pick-list edit-parent-tag-pick-list">
                      {filteredAddCandidates.map((child) => (
                        <li key={child.id}>
                          <label className="tag-manage-assign-pick">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => toggleChild(child.id)}
                              disabled={saving}
                            />
                            <span className="tag-manage-pill">
                              {displayTagName(child.name)}
                            </span>
                          </label>
                        </li>
                      ))}
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
              className="btn btn--danger"
              disabled={deleteConfirmOpen || saving}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              상위태그 삭제
            </button>
            <button
              type="button"
              className="btn btn--emphasis edit-note-modal-submit"
              disabled={!canSave || saving}
              onClick={() => {
                setError(null)
                setSaving(true)
                const tagId = tag.id
                const saveName = name
                const label = normalizeTagInput(saveName)
                const childIds = [...selectedChildIds]

                if (nameChanged) {
                  onTagUpdated({
                    ...tag,
                    name: label,
                  })
                }
                if (childrenChanged) {
                  onChildrenSynced?.(
                    applyParentChildrenSelection(
                      tagId,
                      childIds,
                      tags,
                      links,
                    ),
                  )
                }

                onClose()
                void (async () => {
                  try {
                    if (nameChanged) {
                      const row = await updateTag(tagId, saveName)
                      onTagUpdated(row)
                    }
                    if (childrenChanged) {
                      const result = await syncParentTagChildren(tagId, childIds)
                      onChildrenSynced?.(result)
                    }
                  } catch (e) {
                    console.error(
                      '[태그노트] EditParentTagModal 저장 실패',
                      { tagId, nameLength: saveName.length },
                      e,
                    )
                    await onSyncFromServer?.()
                    onTagError?.(
                      e instanceof Error
                        ? e.message
                        : '저장하지 못했습니다.',
                    )
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

      <ConfirmModal
        open={deleteConfirmOpen}
        title="상위태그 삭제"
        message={`「${displayTagName(tag.name)}」 상위태그를 삭제할까요? 하위 태그는 삭제되지 않고 미분류(상위 미지정) 태그로 남습니다. 메모는 삭제되지 않고, 이 상위태그와의 연결만 제거됩니다. 삭제 후에는 다시 복구할 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel="삭제"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setError(null)
          const tagId = tag.id
          onTagDeleted({ tagId, deletedNoteIds: [] })
          setDeleteConfirmOpen(false)
          onClose()
          void (async () => {
            try {
              await deleteParentTag(tagId)
              await onSourcesChanged?.()
            } catch (e) {
              console.error(
                '[태그노트] EditParentTagModal 상위태그 삭제 실패',
                { tagId },
                e,
              )
              await onSyncFromServer?.()
              onTagError?.(
                e instanceof Error ? e.message : '삭제하지 못했습니다.',
              )
            }
          })()
        }}
      />
    </>
  )
}
