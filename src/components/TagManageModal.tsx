import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AddParentTagModal } from './AddParentTagModal'
import { AssignTagsToParentModal } from './AssignTagsToParentModal'
import { EditTagModal } from './EditTagModal'
import {
  filterTagsByMainSearch,
  type PromoteTagToParentResult,
  type TagParentLink,
  type TagRow,
} from '../lib/notesApi'
import {
  displayTagName,
  getChildTags,
  getIndependentTags,
  getParentTags,
  normalizeTagInput,
} from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tags: TagRow[]
  tagParentLinks?: TagParentLink[]
  userId: string | null
  onTagCreated: (row: TagRow) => void
  onTagsAssigned: (rows: TagRow[]) => void
  onTagUpdated: (row: TagRow) => void
  onTagsPromoted?: (result: PromoteTagToParentResult) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  onTagError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
}

function tagMatchesSearch(tags: TagRow[], q: string, tag: TagRow): boolean {
  if (!q) return true
  return filterTagsByMainSearch(tags, q).some((t) => t.id === tag.id)
}

function sortTagsByName(list: TagRow[]): TagRow[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function TagManageModal({
  open,
  onClose,
  tags,
  tagParentLinks = [],
  userId,
  onTagCreated,
  onTagsAssigned,
  onTagUpdated,
  onTagsPromoted,
  onTagDeleted,
  onTagError,
  onSyncFromServer,
  onSourcesChanged,
}: Props) {
  const titleId = useId()
  const [q, setQ] = useState('')
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)
  const [addParentOpen, setAddParentOpen] = useState(false)
  const [assignParentTag, setAssignParentTag] = useState<TagRow | null>(null)
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)

  const parentTagsWithChildren = useMemo(
    () => getParentTags(tags, tagParentLinks),
    [tags, tagParentLinks],
  )
  const independentTags = useMemo(
    () => getIndependentTags(tags, tagParentLinks),
    [tags, tagParentLinks],
  )

  const menuParents = useMemo(() => {
    const map = new Map<string, TagRow>()
    for (const t of parentTagsWithChildren) {
      map.set(t.id, t)
    }
    if (selectedParentId) {
      const selected = tags.find((t) => t.id === selectedParentId)
      if (selected && !selected.parent_id) {
        map.set(selected.id, selected)
      }
    }
    return sortTagsByName([...map.values()])
  }, [parentTagsWithChildren, selectedParentId, tags])

  const links = tagParentLinks

  const filteredMenuParents = useMemo(
    () =>
      menuParents.filter((t) => {
        if (tagMatchesSearch(tags, q, t)) return true
        return getChildTags(t.id, tags, links).some((child) =>
          tagMatchesSearch(tags, q, child),
        )
      }),
    [menuParents, tags, q, links],
  )

  const selectedParent = useMemo(() => {
    if (!selectedParentId) return null
    return tags.find((t) => t.id === selectedParentId) ?? null
  }, [selectedParentId, tags])

  const selectedChildren = useMemo(() => {
    if (!selectedParentId) return []
    return getChildTags(selectedParentId, tags, links).filter(
      (child) =>
        tagMatchesSearch(tags, q, child) ||
        tagMatchesSearch(tags, q, selectedParent!),
    )
  }, [selectedParentId, tags, q, selectedParent, links])

  const filteredIndependent = useMemo(
    () =>
      independentTags.filter(
        (t) =>
          t.id !== selectedParentId && tagMatchesSearch(tags, q, t),
      ),
    [independentTags, selectedParentId, tags, q],
  )

  const hasAnyVisible =
    filteredMenuParents.length > 0 || filteredIndependent.length > 0

  const closeModal = useCallback(() => {
    setQ('')
    setEditingTag(null)
    setAddParentOpen(false)
    setAssignParentTag(null)
    setSelectedParentId(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) {
      setEditingTag(null)
      setAddParentOpen(false)
      setAssignParentTag(null)
      setSelectedParentId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSelectedParentId((cur) => {
      if (cur && menuParents.some((t) => t.id === cur)) return cur
      return menuParents[0]?.id ?? null
    })
  }, [open, menuParents])

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
                {filteredMenuParents.length > 0 ? (
                  <>
                    <nav
                      className="tag-manage-parent-menu"
                      aria-label="상위 태그"
                    >
                      {filteredMenuParents.map((parent) => {
                        const childCount = getChildTags(parent.id, tags, links).length
                        const active = selectedParentId === parent.id
                        return (
                          <button
                            key={parent.id}
                            type="button"
                            className={`tag-manage-parent-tab${
                              active ? ' tag-manage-parent-tab--active' : ''
                            }`}
                            aria-current={active ? 'true' : undefined}
                            onClick={() => setSelectedParentId(parent.id)}
                          >
                            <span className="tag-manage-parent-tab-label">
                              {normalizeTagInput(parent.name)}
                            </span>
                            <span className="tag-manage-parent-tab-count">
                              {childCount}
                            </span>
                          </button>
                        )
                      })}
                    </nav>

                    {selectedParent ? (
                      <section
                        className="tag-manage-panel"
                        aria-label={`${displayTagName(selectedParent.name)} 하위 태그`}
                      >
                        <div className="tag-manage-panel-head">
                          <div>
                            <h3 className="tag-manage-panel-title">
                              {normalizeTagInput(selectedParent.name)}
                            </h3>
                            <p className="tag-manage-panel-desc">
                              이 상위 태그 아래 하위 태그만 붙습니다. (2단계)
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn tag-manage-panel-add-btn"
                            disabled={!userId}
                            onClick={() => setAssignParentTag(selectedParent)}
                          >
                            하위 태그 추가
                          </button>
                        </div>

                        <div className="tag-manage-panel-actions">
                          <button
                            type="button"
                            className="tag-manage-row-button tag-manage-panel-parent-edit"
                            aria-label={`${displayTagName(selectedParent.name)} 상위 태그 수정`}
                            onClick={() => setEditingTag(selectedParent)}
                          >
                            <span className="tag-manage-pill tag-manage-pill--parent">
                              {displayTagName(selectedParent.name)}
                            </span>
                            <span className="tag-manage-panel-edit-hint">
                              상위 태그 이름 수정
                            </span>
                          </button>
                        </div>

                        {selectedChildren.length > 0 ? (
                          <ul className="tag-manage-child-list">
                            {selectedChildren.map((child) => (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  className="tag-manage-row-button"
                                  aria-label={`${displayTagName(child.name)} 하위 태그 수정`}
                                  onClick={() => setEditingTag(child)}
                                >
                                  <span className="tag-manage-pill">
                                    {displayTagName(child.name)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="tag-manage-tree-empty">
                            아직 하위 태그가 없습니다. 「하위 태그 추가」로
                            새로 만들거나, 아래 「상위 미지정」 태그를
                            넣을 수 있습니다.
                          </p>
                        )}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <p className="tag-manage-empty tag-manage-empty--lead">
                    상위 태그를 먼저 추가하세요. 상위 → 하위 2단계만 사용합니다.
                  </p>
                )}

                {filteredIndependent.length > 0 ? (
                  <section
                    className="tag-manage-section tag-manage-section--unassigned"
                    aria-label="상위 미지정 태그"
                  >
                    <h3 className="tag-manage-section-title">상위 미지정</h3>
                    <p className="tag-manage-section-desc">
                      아직 상위 태그 아래에 넣지 않은 태그입니다. 위에서 상위
                      태그를 고른 뒤 「하위 태그 추가」에서 여기 태그를
                      선택하세요.
                    </p>
                    <ul className="tag-manage-child-list">
                      {filteredIndependent.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="tag-manage-row-button"
                            aria-label={`${displayTagName(t.name)} 태그 수정`}
                            onClick={() => setEditingTag(t)}
                          >
                            <span className="tag-manage-pill">
                              {displayTagName(t.name)}
                            </span>
                          </button>
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
            setSelectedParentId(row.id)
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
          tagParentLinks={tagParentLinks}
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
        onTagsPromoted={onTagsPromoted}
        onTagError={onTagError}
        onSyncFromServer={onSyncFromServer}
        onSourcesChanged={onSourcesChanged}
      />
    </>
  )
}
