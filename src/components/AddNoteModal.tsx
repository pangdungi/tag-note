import { useEffect, useId, useState, startTransition } from 'react'
import { TagComposer, type SelectedTag } from './TagComposer'
import { createNoteWithTags, type NoteWithTags, type TagRow } from '../lib/notesApi'

type Props = {
  open: boolean
  onClose: () => void
  /** 열릴 때 태그칩에 미리 넣을 값(검색으로 새 태그 추가 등) */
  initialTags: SelectedTag[]
  allTags: TagRow[]
  userId: string
  onSaved: (note: NoteWithTags) => void | Promise<void>
}

export function AddNoteModal({
  open,
  onClose,
  initialTags,
  allTags,
  userId,
  onSaved,
}: Props) {
  const titleId = useId()
  const idBase = useId()
  const bodyId = `${idBase}-body`
  const sourceId = `${idBase}-source`

  const [tags, setTags] = useState<SelectedTag[]>([])
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setTags(initialTags.map((t) => ({ ...t })))
      setBody('')
      setSource('')
      setError(null)
      setSaving(false)
    })
  }, [open, initialTags])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="tag-manage-overlay" role="presentation">
      <button
        type="button"
        className="tag-manage-backdrop"
        aria-label="닫기"
        onClick={() => onClose()}
      />
      <div
        className="tag-manage-dialog tag-manage-dialog--edit-note"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            메모 추가
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="메모 추가 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>
        <div className="edit-note-modal-body">
          <div className="composer-stack">
            <TagComposer allTags={allTags} selected={tags} onChange={setTags} />
            <div className="composer-field">
              <label className="composer-label" htmlFor={bodyId}>
                메모
              </label>
              <textarea
                id={bodyId}
                className="composer-note edit-note-modal-note"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="내용을 입력하세요"
                rows={6}
              />
            </div>
            <div className="composer-field">
              <label className="composer-label" htmlFor={sourceId}>
                출처
              </label>
              <input
                id={sourceId}
                type="text"
                className="composer-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="책, 링크, 기사 등 (선택)"
                autoComplete="off"
              />
            </div>
          </div>
          {error ? <p className="composer-error">{error}</p> : null}
          <div className="edit-note-modal-actions edit-note-modal-actions--add-only">
            <button
              type="button"
              className="btn btn--emphasis"
              disabled={saving || tags.length === 0}
              onClick={() => {
                void (async () => {
                  setSaving(true)
                  setError(null)
                  try {
                    const note = await createNoteWithTags(
                      body,
                      tags.map((t) => t.name),
                      userId,
                      [...allTags],
                      source,
                    )
                    await onSaved(note)
                    onClose()
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : '저장에 실패했습니다.',
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
  )
}
