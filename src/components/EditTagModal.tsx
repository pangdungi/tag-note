import { useEffect, useId, useState, startTransition } from 'react'
import { ConfirmModal } from './ConfirmModal'
import { deleteTagAndLinkedNotes, updateTag, type TagRow } from '../lib/notesApi'
import { displayTagName, normalizeTagInput } from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tag: TagRow | null
  onTagUpdated: (row: TagRow) => void
  onTagDeleted: (payload: { tagId: string; deletedNoteIds: string[] }) => void
}

export function EditTagModal({
  open,
  onClose,
  tag,
  onTagUpdated,
  onTagDeleted,
}: Props) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const busy = saving || deleting

  useEffect(() => {
    if (!open || !tag) return
    startTransition(() => {
      setName(tag.name)
      setError(null)
      setSaving(false)
      setDeleting(false)
      setDeleteConfirmOpen(false)
    })
  }, [open, tag])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (deleteConfirmOpen) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, deleteConfirmOpen])

  if (!open || !tag) return null

  return (
    <>
      <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
        <button
          type="button"
          className="tag-manage-backdrop"
          aria-label="닫기"
          onClick={() => onClose()}
        />
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
            <div className="edit-note-modal-actions">
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy || deleteConfirmOpen}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {deleting ? '삭제 중…' : '태그 삭제'}
              </button>
              <button
                type="button"
                className="btn btn--emphasis edit-note-modal-submit"
                disabled={busy || !normalizeTagInput(name)}
                onClick={() => {
                  void (async () => {
                    setSaving(true)
                    setError(null)
                    try {
                      const row = await updateTag(tag.id, name)
                      onTagUpdated(row)
                      onClose()
                    } catch (e) {
                      setError(
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
      </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="태그 삭제"
        message={`「${displayTagName(tag.name)}」 태그를 삭제할까요? 이 태그가 붙어 있는 메모는 모두 함께 삭제됩니다. 다른 태그가 함께 붙어 있어도 메모 전체가 지워집니다. 삭제 후에는 다시 복구할 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel={deleting ? '삭제 중…' : '삭제'}
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false)
        }}
        onConfirm={async () => {
          setDeleting(true)
          setError(null)
          try {
            const result = await deleteTagAndLinkedNotes(tag.id)
            setDeleteConfirmOpen(false)
            onTagDeleted({
              tagId: result.deletedTagId,
              deletedNoteIds: result.deletedNoteIds,
            })
            onClose()
          } catch (e) {
            setDeleteConfirmOpen(false)
            setError(
              e instanceof Error ? e.message : '삭제하지 못했습니다.',
            )
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}
