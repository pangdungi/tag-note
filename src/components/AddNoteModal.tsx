import { useEffect, useId, useState, startTransition } from 'react'
import { TagComposer, type SelectedTag } from './TagComposer'
import {
  createNoteWithTags,
  type NoteWithTags,
  type TagRow,
} from '../lib/notesApi'

type Props = {
  open: boolean
  onClose: () => void
  /** 열릴 때 태그칩에 미리 넣을 값(검색으로 새 태그 추가 등) */
  initialTags: SelectedTag[]
  allTags: TagRow[]
  userId: string
  onSaved: (note: NoteWithTags) => void | Promise<void>
  onSaveError?: (message: string) => void
}

export function AddNoteModal({
  open,
  onClose,
  initialTags,
  allTags,
  userId,
  onSaved,
  onSaveError,
}: Props) {
  const titleId = useId()
  const idBase = useId()
  const bodyId = `${idBase}-body`
  const sourceId = `${idBase}-source`

  const [tags, setTags] = useState<SelectedTag[]>([])
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** 저장 클릭 시 검증: 태그 영역 또는 메모 아래 안내 */
  const [fieldHint, setFieldHint] = useState<'tags' | 'body' | null>(null)

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setTags(initialTags.map((t) => ({ ...t })))
      setBody('')
      setSource('')
      setError(null)
      setFieldHint(null)
    })
  }, [open, initialTags])

  if (!open) return null

  const composerSaveReady =
    tags.length > 0 && body.trim().length > 0

  return (
    <div className="tag-manage-overlay" role="presentation">
      <div className="tag-manage-backdrop" aria-hidden="true" />
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
            <TagComposer
              allTags={allTags}
              selected={tags}
              onChange={(next) => {
                setTags(next)
                setFieldHint((h) => (h === 'tags' ? null : h))
              }}
              hint={
                fieldHint === 'tags' ? (
                  <p className="composer-field-hint" role="status">
                    태그를 추가해 주세요.
                  </p>
                ) : undefined
              }
            />
            <div className="composer-field">
              <label className="composer-label" htmlFor={bodyId}>
                메모
              </label>
              <textarea
                id={bodyId}
                className="composer-note edit-note-modal-note"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  setFieldHint((h) => (h === 'body' ? null : h))
                }}
                placeholder="내용을 입력하세요"
                rows={6}
              />
              {fieldHint === 'body' ? (
                <p className="composer-field-hint" role="status">
                  메모를 입력해 주세요.
                </p>
              ) : null}
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
              className={`btn btn--emphasis${
                composerSaveReady ? ' btn--composer-ready' : ''
              }`}
              onClick={() => {
                setError(null)
                if (tags.length === 0) {
                  setFieldHint('tags')
                  return
                }
                if (!body.trim()) {
                  setFieldHint('body')
                  return
                }
                setFieldHint(null)
                const saveBody = body
                const saveTags = tags.map((t) => t.name)
                const saveSource = source
                onClose()
                void (async () => {
                  try {
                    const note = await createNoteWithTags(
                      saveBody,
                      saveTags,
                      userId,
                      [...allTags],
                      saveSource,
                    )
                    await onSaved(note)
                  } catch (e) {
                    onSaveError?.(
                      e instanceof Error ? e.message : '저장에 실패했습니다.',
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
    </div>
  )
}
