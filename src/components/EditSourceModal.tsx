import { useEffect, useId, useState, startTransition } from 'react'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteSourceKeepNotes,
  updateSourceTitle,
  type SourceRow,
} from '../lib/notesApi'
import { displaySourceTitle, normalizeSourceTitle } from '../lib/sourceUtils'

type Props = {
  open: boolean
  onClose: () => void
  source: SourceRow | null
  onSourceUpdated: (row: SourceRow) => void
  onSourceDeleted: (sourceId: string) => void
  onSourceError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
}

export function EditSourceModal({
  open,
  onClose,
  source,
  onSourceUpdated,
  onSourceDeleted,
  onSourceError,
  onSyncFromServer,
}: Props) {
  const titleId = useId()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !source) return
    startTransition(() => {
      setTitle(source.title)
      setError(null)
      setDeleteConfirmOpen(false)
      setSaving(false)
    })
  }, [open, source])

  if (!open || !source) return null

  const titleChanged =
    normalizeSourceTitle(title) !== normalizeSourceTitle(source.title)
  const canSave =
    normalizeSourceTitle(title).length > 0 && titleChanged

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
              출처 수정
            </h2>
            <button
              type="button"
              className="tag-manage-close"
              aria-label="출처 수정 닫기"
              onClick={() => onClose()}
            >
              ×
            </button>
          </div>
          <div className="edit-note-modal-body">
            <div className="composer-stack">
              <div className="composer-field">
                <label className="composer-label" htmlFor="edit-source-title">
                  출처 이름
                </label>
                <input
                  id="edit-source-title"
                  type="text"
                  className="composer-source"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="출처 이름"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>
            {error ? <p className="composer-error">{error}</p> : null}
          </div>
          <div className="edit-note-modal-actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={deleteConfirmOpen || saving}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              출처 삭제
            </button>
            <button
              type="button"
              className="btn btn--emphasis edit-note-modal-submit"
              disabled={!canSave || saving}
              onClick={() => {
                setError(null)
                setSaving(true)
                const sourceId = source.id
                const saveTitle = title
                const label = normalizeSourceTitle(saveTitle)
                onSourceUpdated({
                  ...source,
                  title: label,
                })
                onClose()
                void (async () => {
                  try {
                    const row = await updateSourceTitle(sourceId, saveTitle)
                    onSourceUpdated(row)
                  } catch (e) {
                    console.error('[태그노트] EditSourceModal 저장 실패', {
                      sourceId,
                      titleLength: saveTitle.length,
                    }, e)
                    await onSyncFromServer?.()
                    onSourceError?.(
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
        title="출처 삭제"
        message={`「${displaySourceTitle(source.title)}」 출처를 삭제할까요? 태그와 메모는 그대로 남고, 연결된 메모에서만 출처 정보가 제거됩니다.`}
        cancelLabel="취소"
        confirmLabel="삭제"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setError(null)
          const sourceId = source.id
          onSourceDeleted(sourceId)
          setDeleteConfirmOpen(false)
          onClose()
          void (async () => {
            try {
              await deleteSourceKeepNotes(sourceId)
            } catch (e) {
              console.error('[태그노트] EditSourceModal 출처 삭제 실패', {
                sourceId,
              }, e)
              await onSyncFromServer?.()
              onSourceError?.(
                e instanceof Error ? e.message : '삭제하지 못했습니다.',
              )
            }
          })()
        }}
      />
    </>
  )
}
