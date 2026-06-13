import { useEffect, useId, useState, startTransition } from 'react'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteTagAndLinkedNotes,
  unassignTagFromParent,
  updateTag,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput, TAG_COLOR_COUNT } from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tag: TagRow | null
  tags: TagRow[]
  onTagUpdated: (row: TagRow) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
  /** 태그 삭제 시 로컬에서 함께 지울 메모 id (화면 즉시 반영용) */
  resolveLinkedNoteIds?: (tagId: string) => string[]
  onTagError?: (message: string) => void
  /** 저장·삭제 실패 시 서버 기준으로 다시 불러옴 */
  onSyncFromServer?: () => void | Promise<void>
  onSourcesChanged?: () => void | Promise<void>
}

export function EditTagModal({
  open,
  onClose,
  tag,
  tags,
  onTagUpdated,
  onTagDeleted,
  resolveLinkedNoteIds,
  onTagError,
  onSyncFromServer,
  onSourcesChanged,
}: Props) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open || !tag) return
    startTransition(() => {
      setName(tag.name)
      setError(null)
      setDeleteConfirmOpen(false)
    })
  }, [open, tag])

  if (!open || !tag) return null

  const parentTag = tag.parent_id
    ? tags.find((t) => t.id === tag.parent_id) ?? null
    : null

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
              태그 수정
            </h2>
            <button
              type="button"
              className="tag-manage-close"
              aria-label="태그 수정 닫기"
              onClick={() => onClose()}
            >
              ×
            </button>
          </div>
          <div className="edit-note-modal-body">
            <div className="composer-stack">
              {parentTag ? (
                <p className="tag-manage-hint">
                  상위 태그:{' '}
                  <span
                    className={`tag-manage-pill tag-tone-${parentTag.color_index % TAG_COLOR_COUNT}`}
                  >
                    {displayTagName(parentTag.name)}
                  </span>
                </p>
              ) : null}
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
            </div>
            {error ? <p className="composer-error">{error}</p> : null}
          </div>
          <div className="edit-note-modal-actions">
            {parentTag ? (
              <button
                type="button"
                className="btn"
                disabled={deleteConfirmOpen}
                onClick={() => {
                  setError(null)
                  const tagId = tag.id
                  onTagUpdated({ ...tag, parent_id: null })
                  onClose()
                  void (async () => {
                    try {
                      const row = await unassignTagFromParent(tagId)
                      onTagUpdated(row)
                    } catch (e) {
                      console.error('[태그노트] EditTagModal 상위 해제 실패', {
                        tagId,
                      }, e)
                      await onSyncFromServer?.()
                      onTagError?.(
                        e instanceof Error
                          ? e.message
                          : '상위 태그에서 빼지 못했습니다.',
                      )
                    }
                  })()
                }}
              >
                상위에서 빼기
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--danger"
              disabled={deleteConfirmOpen}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              태그 삭제
            </button>
            <button
              type="button"
              className="btn btn--emphasis edit-note-modal-submit"
              disabled={!normalizeTagInput(name)}
              onClick={() => {
                  setError(null)
                  const tagId = tag.id
                  const saveName = name
                  const label = normalizeTagInput(saveName)
                  onTagUpdated({ ...tag, name: label })
                  onClose()
                  void (async () => {
                    try {
                      const row = await updateTag(tagId, saveName)
                      onTagUpdated(row)
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
                    }
                  })()
                }}
              >
                저장
              </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="태그 삭제"
        message={`「${displayTagName(tag.name)}」 태그를 삭제할까요? 이 태그가 붙어 있는 메모는 모두 함께 삭제됩니다. 다른 태그가 함께 붙어 있어도 메모 전체가 지워집니다. 삭제 후에는 다시 복구할 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel="삭제"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setError(null)
          const tagId = tag.id
          const deletedNoteIds = resolveLinkedNoteIds?.(tagId) ?? []
          onTagDeleted({ tagId, deletedNoteIds })
          setDeleteConfirmOpen(false)
          onClose()
          void (async () => {
            try {
              await deleteTagAndLinkedNotes(tagId)
              await onSourcesChanged?.()
            } catch (e) {
              console.error('[태그노트] EditTagModal 태그 삭제 실패', {
                tagId,
              }, e)
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
