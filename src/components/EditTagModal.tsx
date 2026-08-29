import { useEffect, useId, useMemo, useState, startTransition } from 'react'
import { ModalFooter } from './ModalFooter'
import { ConfirmModal } from './ConfirmModal'
import { ModalSelect } from './ModalSelect'
import {
  bulkAddMainTagToNotesWithTag,
  deleteTag,
  deleteParentTag,
  promoteTagToParent,
  supabaseErrorMessage,
  updateTag,
  updateTagParent,
  type PromoteTagToParentResult,
  type TagRow,
} from '../lib/notesApi'
import {
  canPromoteTagToParent,
  displayTagName,
  getParentTagCandidates,
  isBooksRailParentTag,
  normalizeTagInput,
  resolveTagEditParentId,
  tagHasChildren,
  type TagParentLink,
} from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tag: TagRow | null
  tags: TagRow[]
  tagParentLinks?: TagParentLink[]
  onTagUpdated: (row: TagRow) => void
  onTagParentSynced?: (
    tagId: string,
    parentId: string | null,
    row: TagRow,
  ) => void
  /** 메인 태그 수정 — 다른 메인 태그를 메모에 일괄 적용 */
  onBulkMainTagApplied?: (
    sourceTagId: string,
    targetTag: TagRow,
  ) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  /** 상위태그 승격 후 하위로 편입된 태그 */
  onTagsPromoted?: (result: PromoteTagToParentResult) => void
  onTagError?: (message: string) => void
  /** 저장·삭제 실패 시 서버 기준으로 다시 불러옴 */
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
  onAfterTagDeleted?: () => void | Promise<void>
}

export function EditTagModal({
  open,
  onClose,
  tag,
  tags,
  tagParentLinks = [],
  onTagUpdated,
  onTagParentSynced,
  onBulkMainTagApplied,
  onTagDeleted,
  onTagsPromoted,
  onTagError,
  onSyncFromServer,
  onSourcesChanged,
  onAfterTagDeleted,
}: Props) {
  const titleId = useId()
  const parentFieldId = useId()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [baselineParentId, setBaselineParentId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !tag) return
    startTransition(() => {
      const resolvedParent = resolveTagEditParentId(tag, tagParentLinks)
      setName(tag.name)
      setParentId(resolvedParent)
      setBaselineParentId(resolvedParent)
      setError(null)
      setDeleteConfirmOpen(false)
      setDeleteBusy(false)
      setPromoteConfirmOpen(false)
      setSaving(false)
    })
  }, [open, tag, tagParentLinks])

  const parentCandidates = useMemo(() => {
    if (!tag) return []
    return getParentTagCandidates(tag, tags, tagParentLinks)
  }, [tag, tags, tagParentLinks])

  const parentSelectOptions = useMemo(
    () =>
      parentCandidates.map((candidate) => ({
        value: candidate.id,
        label: normalizeTagInput(candidate.name),
      })),
    [parentCandidates],
  )

  const canPickParent = parentCandidates.length > 0

  if (!open || !tag) return null

  const canPromote = canPromoteTagToParent(tag, tags)

  const nameChanged = normalizeTagInput(name) !== normalizeTagInput(tag.name)
  const parentChanged = (parentId || null) !== (baselineParentId || null)
  const canSave =
    normalizeTagInput(name).length > 0 && (nameChanged || parentChanged)

  const isParentTag = tagHasChildren(tag.id, tags)
  const isMainTag = isBooksRailParentTag(tag, tags, tagParentLinks)
  const modalTitle = isMainTag ? '메인 태그 수정' : '태그 수정'
  const deleteConfirmMessage = isParentTag
    ? `「${displayTagName(tag.name)}」 상위태그를 삭제할까요? 하위 태그는 삭제되지 않고 미분류(상위 미지정) 태그로 남습니다. 메모는 삭제되지 않고, 이 상위태그와의 연결만 제거됩니다. 삭제 후에는 다시 복구할 수 없습니다.`
    : `「${displayTagName(tag.name)}」 태그를 삭제할까요? 메모는 삭제되지 않습니다. 이 태그 연결만 제거되고, 태그가 하나도 없는 메모는 「태그 없음」에 보입니다. 삭제 후에는 다시 복구할 수 없습니다.`

  return (
    <>
      <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
        <div className="tag-manage-backdrop" aria-hidden="true" />
        <div
          className="tag-manage-dialog tag-manage-dialog--edit-tag"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="tag-manage-head">
            <h2 id={titleId} className="tag-manage-title">
              {modalTitle}
            </h2>
            <button
              type="button"
              className="tag-manage-close"
              aria-label={`${modalTitle} 닫기`}
              onClick={() => onClose()}
            >
              ×
            </button>
          </div>
          <div className="edit-note-modal-body">
            <div className="composer-stack">
              <div className="composer-field">
                <label className="composer-label" htmlFor="edit-tag-name">
                  태그 이름
                </label>
                <input
                  id="edit-tag-name"
                  type="text"
                  className="composer-source"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="태그 이름"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              {canPickParent ? (
                <div className="composer-field">
                  <label className="composer-label" htmlFor={parentFieldId}>
                    {isMainTag ? '일괄 적용할 메인 태그' : '상위 태그'}
                  </label>
                  <ModalSelect
                    id={parentFieldId}
                    value={parentId}
                    options={parentSelectOptions}
                    emptyLabel="없음 (상위 미지정)"
                    onChange={setParentId}
                  />
                </div>
              ) : null}
              {canPromote ? (
                <div className="composer-field">
                  <button
                    type="button"
                    className="btn btn--block edit-tag-promote-btn"
                    disabled={deleteConfirmOpen || promoteConfirmOpen || saving}
                    onClick={() => setPromoteConfirmOpen(true)}
                  >
                    상위태그로 변경하기
                  </button>
                </div>
              ) : null}
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
              태그 삭제
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
                const nextParentId = parentId || null
                const label = normalizeTagInput(saveName)
                const bulkMainTagApply =
                  isMainTag && parentChanged && nextParentId != null
                const targetMainTag = bulkMainTagApply
                  ? tags.find((t) => t.id === nextParentId) ?? null
                  : null
                const optimisticRow = {
                  ...tag,
                  name: label,
                  ...(bulkMainTagApply ? {} : { parent_id: nextParentId }),
                }
                if (bulkMainTagApply && targetMainTag) {
                  onBulkMainTagApplied?.(tagId, targetMainTag)
                }
                if (nameChanged) {
                  onTagUpdated(optimisticRow)
                } else if (parentChanged && !bulkMainTagApply && !isMainTag) {
                  onTagParentSynced?.(tagId, nextParentId, optimisticRow)
                }
                onClose()
                void (async () => {
                  try {
                    let row = tag
                    if (nameChanged) {
                      row = await updateTag(tagId, saveName)
                    }
                    if (bulkMainTagApply && nextParentId) {
                      await bulkAddMainTagToNotesWithTag(tagId, nextParentId)
                      if (nameChanged) {
                        onTagUpdated(row)
                      }
                    } else if (parentChanged && !isMainTag) {
                      row = await updateTagParent(tagId, nextParentId)
                      onTagParentSynced?.(tagId, nextParentId, row)
                    } else if (nameChanged) {
                      onTagUpdated(row)
                    }
                  } catch (e) {
                    console.error('[태그노트] EditTagModal 저장 실패', {
                      tagId,
                      nameLength: saveName.length,
                    }, e)
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
        open={promoteConfirmOpen}
        title="상위태그로 변경"
        message={`「${displayTagName(tag.name)}」을(를) 상위태그(책)로 바꿀까요? 이 태그가 붙은 메모는 그대로 유지되고, 같은 메모에 함께 붙은 다른 태그들이 이 상위태그의 하위로 연결됩니다.`}
        cancelLabel="취소"
        confirmLabel={saving ? '변경 중…' : '변경'}
        busy={saving}
        onCancel={() => {
          if (saving) return
          setPromoteConfirmOpen(false)
        }}
        onConfirm={() => {
          if (saving) return
          setError(null)
          const tagId = tag.id
          void (async () => {
            setSaving(true)
            try {
              const result = await promoteTagToParent(tagId)
              setPromoteConfirmOpen(false)
              onTagsPromoted?.(result)
              onTagUpdated(result.parent)
              onClose()
            } catch (e) {
              const message = supabaseErrorMessage(
                e,
                '상위태그로 변경하지 못했습니다.',
              )
              console.error('[태그노트] EditTagModal 상위태그 승격 실패', {
                tagId,
                message,
                error: e,
              })
              setPromoteConfirmOpen(false)
              await onSyncFromServer?.()
              onTagError?.(message)
            } finally {
              setSaving(false)
            }
          })()
        }}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title="태그 삭제"
        message={deleteConfirmMessage}
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
            if (isParentTag) {
              await deleteParentTag(tagId)
            } else {
              await deleteTag(tagId)
              await onSourcesChanged?.()
            }
            if (isParentTag) {
              await onAfterTagDeleted?.()
            }
            onTagDeleted({ tagId, deletedNoteIds: [] })
            setDeleteConfirmOpen(false)
            onClose()
          } catch (e) {
            console.error('[태그노트] EditTagModal 태그 삭제 실패', {
              tagId,
            }, e)
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
