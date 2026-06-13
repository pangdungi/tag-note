import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AddParentTagModal } from './AddParentTagModal'
import { AssignTagsToParentModal } from './AssignTagsToParentModal'
import { EditTagModal } from './EditTagModal'
import { filterTagsByMainSearch, type TagRow } from '../lib/notesApi'
import {
  displayTagName,
  getChildTags,
  getIndependentTags,
  getParentTags,
  TAG_COLOR_COUNT,
} from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tags: TagRow[]
  userId: string | null
  onTagCreated: (row: TagRow) => void
  onTagsAssigned: (rows: TagRow[]) => void
  onTagUpdated: (row: TagRow) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  resolveLinkedNoteIds?: (tagId: string) => string[]
  onTagError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
}

function tagMatchesSearch(tags: TagRow[], q: string, tag: TagRow): boolean {
  if (!q) return true
  return filterTagsByMainSearch(tags, q).some((t) => t.id === tag.id)
}

export function TagManageModal({
  open,
  onClose,
  tags,
  userId,
  onTagCreated,
  onTagsAssigned,
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
  const [addParentOpen, setAddParentOpen] = useState(false)
  const [assignParentTag, setAssignParentTag] = useState<TagRow | null>(null)

  const parentTags = useMemo(() => getParentTags(tags), [tags])
  const independentTags = useMemo(() => getIndependentTags(tags), [tags])

  const filteredParents = useMemo(
    () =>
      parentTags.filter((t) => {
        if (tagMatchesSearch(tags, q, t)) return true
        return getChildTags(t.id, tags).some((child) =>
          tagMatchesSearch(tags, q, child),
        )
      }),
    [parentTags, tags, q],
  )

  const filteredIndependent = useMemo(
    () => independentTags.filter((t) => tagMatchesSearch(tags, q, t)),
    [independentTags, tags, q],
  )

  const hasAnyVisible =
    filteredParents.length > 0 || filteredIndependent.length > 0

  const closeModal = useCallback(() => {
    setQ('')
    setEditingTag(null)
    setAddParentOpen(false)
    setAssignParentTag(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) {
      setEditingTag(null)
      setAddParentOpen(false)
      setAssignParentTag(null)
    }
  }, [open])

  return (
    <>
      {open ? (
        <div className="tag-manage-overlay" role="presentation">
          <div className="tag-manage-backdrop" aria-hidden="true" />
          <div
            className="tag-manage-dialog tag-manage-dialog--manage"
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

            <div className="tag-manage-toolbar">
              <button
                type="button"
                className="btn btn--emphasis tag-manage-toolbar-btn"
                disabled={!userId}
                onClick={() => setAddParentOpen(true)}
              >
                상위태그 추가
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

            {!hasAnyVisible ? (
              <p className="tag-manage-empty">표시할 태그가 없습니다.</p>
            ) : (
              <div className="tag-manage-scroll">
                {filteredParents.length > 0 ? (
                  <section className="tag-manage-section">
                    <h3 className="tag-manage-section-title">상위 태그</h3>
                    <ul className="tag-manage-tree">
                      {filteredParents.map((parent) => {
                        const children = getChildTags(parent.id, tags).filter((child) =>
                          tagMatchesSearch(tags, q, child) ||
                          tagMatchesSearch(tags, q, parent),
                        )
                        return (
                          <li key={parent.id} className="tag-manage-tree-item">
                            <div className="tag-manage-tree-row">
                              <button
                                type="button"
                                className="tag-manage-row-button"
                                aria-label={`${displayTagName(parent.name)} 태그 수정`}
                                onClick={() => setEditingTag(parent)}
                              >
                                <span
                                  className={`tag-manage-pill tag-tone-${parent.color_index % TAG_COLOR_COUNT}`}
                                  title={displayTagName(parent.name)}
                                >
                                  {displayTagName(parent.name)}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="btn tag-manage-inline-btn"
                                disabled={!userId}
                                onClick={() => setAssignParentTag(parent)}
                              >
                                태그 넣기
                              </button>
                            </div>
                            {children.length > 0 ? (
                              <ul className="tag-manage-tree-children">
                                {children.map((child) => (
                                  <li key={child.id}>
                                    <button
                                      type="button"
                                      className="tag-manage-row-button tag-manage-row-button--child"
                                      aria-label={`${displayTagName(child.name)} 태그 수정`}
                                      onClick={() => setEditingTag(child)}
                                    >
                                      <span
                                        className={`tag-manage-pill tag-tone-${child.color_index % TAG_COLOR_COUNT}`}
                                        title={displayTagName(child.name)}
                                      >
                                        {displayTagName(child.name)}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="tag-manage-tree-empty">
                                하위 태그가 없습니다.
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ) : null}

                {filteredIndependent.length > 0 ? (
                  <section className="tag-manage-section">
                    <h3 className="tag-manage-section-title">독립 태그</h3>
                    <ul className="tag-manage-list">
                      {filteredIndependent.map((t) => (
                        <li key={t.id} className="tag-manage-item">
                          <div className="tag-manage-tree-row">
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
                            <button
                              type="button"
                              className="btn tag-manage-inline-btn"
                              disabled={!userId}
                              onClick={() => setAssignParentTag(t)}
                            >
                              태그 넣기
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {userId ? (
        <AddParentTagModal
          open={open && addParentOpen}
          userId={userId}
          onClose={() => setAddParentOpen(false)}
          onCreated={(row) => {
            onTagCreated(row)
            setAddParentOpen(false)
            setAssignParentTag(row)
          }}
          onError={onTagError}
        />
      ) : null}

      {userId ? (
        <AssignTagsToParentModal
          open={open && assignParentTag !== null}
          parentTag={assignParentTag}
          tags={tags}
          userId={userId}
          onClose={() => setAssignParentTag(null)}
          onAssigned={onTagsAssigned}
          onError={onTagError}
        />
      ) : null}

      <EditTagModal
        open={open && editingTag !== null}
        tag={editingTag}
        tags={tags}
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
