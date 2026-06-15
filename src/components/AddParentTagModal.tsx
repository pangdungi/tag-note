import { useEffect, useId, useState, startTransition } from 'react'
import { createParentTag, type TagRow } from '../lib/notesApi'
import { normalizeTagInput } from '../lib/tagUtils'

type Props = {
  open: boolean
  userId: string
  onClose: () => void
  onCreated: (row: TagRow) => void
  onError?: (message: string) => void
}

export function AddParentTagModal({
  open,
  userId,
  onClose,
  onCreated,
  onError,
}: Props) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setName('')
      setError(null)
      setSaving(false)
    })
  }, [open])

  if (!open) return null

  return (
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
            상위태그 추가
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="상위태그 추가 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>
        <div className="edit-note-modal-body">
          <div className="composer-stack">
            <div className="composer-field">
              <label className="composer-label" htmlFor="add-parent-tag-name">
                상위태그 이름
              </label>
              <input
                id="add-parent-tag-name"
                type="text"
                className="composer-source"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 독서"
                autoComplete="off"
                spellCheck={false}
                autoFocus
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
            disabled={!normalizeTagInput(name) || saving}
            onClick={() => {
              setError(null)
              setSaving(true)
              void (async () => {
                try {
                  const row = await createParentTag(name, userId)
                  onCreated(row)
                  onClose()
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : '상위태그를 추가하지 못했습니다.',
                  )
                  onError?.(
                    e instanceof Error ? e.message : '상위태그를 추가하지 못했습니다.',
                  )
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            {saving ? '추가 중…' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
