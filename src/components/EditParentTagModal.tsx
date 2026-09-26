import { useEffect, useId, useMemo, useRef, useState, startTransition } from 'react'
import { ModalFooter } from './ModalFooter'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteParentTag,
  sourceIdsForFolder,
  syncFolderSources,
  syncParentTagChildren,
  updateTag,
  type FolderSourceLink,
  type SourceRow,
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
import { displaySourceTitle } from '../lib/sourceUtils'

type Props = {
  open: boolean
  onClose: () => void
  tag: TagRow | null
  tags: TagRow[]
  tagParentLinks: TagParentLink[]
  sources: SourceRow[]
  folderSourceLinks: FolderSourceLink[]
  onTagUpdated: (row: TagRow) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  onChildrenSynced?: (payload: {
    tags: TagRow[]
    links: TagParentLink[]
  }) => void
  onFolderSourcesSynced?: (links: FolderSourceLink[]) => void
  onTagError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
  /** 상위태그 삭제 직후 서버 태그 목록 재동기화 */
  onAfterTagDeleted?: () => void | Promise<void>
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((id) => setA.has(id))
}

function FolderPickSection({
  title,
  emptyLabel,
  searchLabel,
  searchPlaceholder,
  searchId,
  selected,
  others,
  search,
  onSearch,
  onToggle,
  disabled,
  renderName,
}: {
  title: string
  emptyLabel: string
  searchLabel: string
  searchPlaceholder: string
  searchId: string
  selected: { id: string }[]
  others: { id: string }[]
  search: string
  onSearch: (value: string) => void
  onToggle: (id: string) => void
  disabled: boolean
  renderName: (id: string) => string
}) {
  const selectedSet = new Set(selected.map((item) => item.id))
  const q = search.trim().toLowerCase()
  const rows = [...selected, ...others.filter((item) => !selectedSet.has(item.id))]
  const visible = q
    ? rows.filter((item) => renderName(item.id).toLowerCase().includes(q))
    : rows

  return (
    <section className="edit-parent-tag-col" aria-label={title}>
      <div className="edit-parent-tag-col-head">
        <h3 className="edit-parent-tag-children-title">{title}</h3>
        {selected.length > 0 ? (
          <span className="tag-manage-assign-selected-count">
            {selected.length}개 선택
          </span>
        ) : null}
      </div>
      <div className="tag-manage-search-wrap edit-parent-tag-search">
        <span className="sr-only">{searchLabel}</span>
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
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {visible.length === 0 ? (
        <p className="edit-parent-tag-empty">{emptyLabel}</p>
      ) : (
        <ul className="edit-parent-tag-list">
          {visible.map((item) => {
            const checked = selectedSet.has(item.id)
            const label = renderName(item.id)
            return (
              <li key={item.id}>
                <label className="edit-parent-tag-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(item.id)}
                    disabled={disabled}
                    aria-label={
                      checked ? `${label} 선택 해제` : `${label} 선택`
                    }
                  />
                  <span className="edit-parent-tag-row-name">{label}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function EditParentTagModal({
  open,
  onClose,
  tag,
  tags,
  tagParentLinks,
  sources,
  folderSourceLinks,
  onTagUpdated,
  onTagDeleted,
  onChildrenSynced,
  onFolderSourcesSynced,
  onTagError,
  onSyncFromServer,
  onSourcesChanged,
  onAfterTagDeleted,
}: Props) {
  const titleId = useId()
  const pickSearchId = useId()
  const sourceSearchId = useId()
  const [name, setName] = useState('')
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [initialChildIds, setInitialChildIds] = useState<string[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [initialSourceIds, setInitialSourceIds] = useState<string[]>([])
  const [pickSearch, setPickSearch] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
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

  const currentSources = useMemo(() => {
    const selected = new Set(selectedSourceIds)
    return sources
      .filter((s) => selected.has(s.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  }, [selectedSourceIds, sources])

  const addSourceCandidates = useMemo(() => {
    const selected = new Set(selectedSourceIds)
    return sources
      .filter((s) => !selected.has(s.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  }, [sources, selectedSourceIds])

  useEffect(() => {
    if (!open || !tag) {
      wasOpenRef.current = false
      return
    }
    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true
    if (!justOpened) return

    const childIds = getChildTags(tag.id, tags, links).map((c) => c.id)
    const sourceIds = sourceIdsForFolder(tag.id, folderSourceLinks)
    startTransition(() => {
      setName(tag.name)
      setSelectedChildIds(childIds)
      setInitialChildIds(childIds)
      setSelectedSourceIds(sourceIds)
      setInitialSourceIds(sourceIds)
      setPickSearch('')
      setSourceSearch('')
      setError(null)
      setDeleteConfirmOpen(false)
      setDeleteBusy(false)
      setSaving(false)
    })
  }, [open, tag, tags, links, folderSourceLinks])

  if (!open || !tag) return null

  const nameChanged = normalizeTagInput(name) !== normalizeTagInput(tag.name)
  const childrenChanged = !sameIdSet(selectedChildIds, initialChildIds)
  const sourcesChanged = !sameIdSet(selectedSourceIds, initialSourceIds)
  const canSave =
    (normalizeTagInput(name).length > 0 && nameChanged) ||
    childrenChanged ||
    sourcesChanged

  function toggleChild(tagId: string) {
    setSelectedChildIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  function toggleSource(sourceId: string) {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId],
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
              폴더 수정
            </h2>
            <button
              type="button"
              className="tag-manage-close"
              aria-label="폴더 수정 닫기"
              onClick={() => onClose()}
            >
              ×
            </button>
          </div>
          <div className="edit-note-modal-body edit-parent-tag-body">
            <div className="composer-stack">
              <div className="composer-field">
                <label className="composer-label" htmlFor="edit-parent-tag-name">
                  폴더 이름
                </label>
                <input
                  id="edit-parent-tag-name"
                  type="text"
                  className="composer-source"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="폴더 이름"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>

            <div className="edit-parent-tag-columns">
              <FolderPickSection
                title="하위 태그"
                emptyLabel="없음"
                searchLabel="하위 태그 검색"
                searchPlaceholder="태그 이름 검색"
                searchId={pickSearchId}
                selected={currentChildren}
                others={addCandidates}
                search={pickSearch}
                onSearch={setPickSearch}
                onToggle={toggleChild}
                disabled={saving}
                renderName={(id) => {
                  const row = tags.find((t) => t.id === id)
                  return row ? displayTagName(row.name) : id
                }}
              />
              <FolderPickSection
                title="출처"
                emptyLabel="없음"
                searchLabel="출처 검색"
                searchPlaceholder="출처 이름 검색"
                searchId={sourceSearchId}
                selected={currentSources}
                others={addSourceCandidates}
                search={sourceSearch}
                onSearch={setSourceSearch}
                onToggle={toggleSource}
                disabled={saving}
                renderName={(id) => {
                  const row = sources.find((s) => s.id === id)
                  return row ? displaySourceTitle(row.title) : id
                }}
              />
            </div>

            {error ? <p className="composer-error">{error}</p> : null}
          </div>
          <ModalFooter>
            <button
              type="button"
              className="btn btn--danger"
              disabled={deleteConfirmOpen || saving}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              폴더 삭제
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
                const sourceIds = [...selectedSourceIds]

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
                if (sourcesChanged) {
                  onFolderSourcesSynced?.([
                    ...folderSourceLinks.filter((l) => l.tag_id !== tagId),
                    ...sourceIds.map((source_id) => ({
                      tag_id: tagId,
                      source_id,
                    })),
                  ])
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
                    if (sourcesChanged) {
                      const nextLinks = await syncFolderSources(tagId, sourceIds)
                      onFolderSourcesSynced?.(nextLinks)
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
          </ModalFooter>
        </div>
      </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="폴더 삭제"
        message={`「${displayTagName(tag.name)}」 폴더를 삭제할까요? 하위 태그는 삭제되지 않고 미분류로 남습니다. 메모는 삭제되지 않고, 이 폴더와의 연결만 제거됩니다. 삭제 후에는 다시 복구할 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel={deleteBusy ? '삭제 중…' : '삭제'}
        danger
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return
          setDeleteConfirmOpen(false)
        }}
        onConfirm={async () => {
          if (deleteBusy) return
          setError(null)
          setDeleteBusy(true)
          const tagId = tag.id
          try {
            await deleteParentTag(tagId)
            await onSourcesChanged?.()
            await onAfterTagDeleted?.()
            onTagDeleted({ tagId, deletedNoteIds: [] })
            setDeleteConfirmOpen(false)
            onClose()
          } catch (e) {
            console.error(
              '[태그노트] EditParentTagModal 상위태그 삭제 실패',
              { tagId },
            )
            await onSyncFromServer?.()
            onTagError?.(
              e instanceof Error ? e.message : '삭제하지 못했습니다.',
            )
          } finally {
            setDeleteBusy(false)
          }
        }}
      />
    </>
  )
}
