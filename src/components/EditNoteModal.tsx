import { useEffect, useId, useState } from 'react'
import { TagComposer, type SelectedTag } from './TagComposer'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteNote,
  updateNoteWithTags,
  type NoteWithTags,
  type TagRow,
} from '../lib/notesApi'

function noteToSelectedTags(note: NoteWithTags): SelectedTag[] {
  return (
    note.note_tags
      .map((nt) => nt.tags)
      .filter(Boolean) as { id: string; name: string; color_index: number }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    color_index: t.color_index,
  }))
}

type Props = {
  open: boolean
  onClose: () => void
  note: NoteWithTags | null
  allTags: TagRow[]
  userId: string
  onSaved: () => void | Promise<void>
}

export function EditNoteModal({
  open,
  onClose,
  note,
  allTags,
  userId,
  onSaved,
}: Props) {
  const titleId = useId()
  const [tags, setTags] = useState<SelectedTag[]>([])
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const busy = saving || deleting

  useEffect(() => {
    if (!open || !note) return
    setTags(noteToSelectedTags(note))
    setBody(note.body ?? '')
    setSource(note.source ?? '')
    setError(null)
    setSaving(false)
    setDeleting(false)
    setDeleteConfirmOpen(false)
  }, [open, note])

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

  if (!open || !note) return null

  return (
    <>
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
            메모 수정
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="메모 수정 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>
        <div className="edit-note-modal-body">
          <div className="composer-stack">
            <TagComposer allTags={allTags} selected={tags} onChange={setTags} />
            <div className="composer-field">
              <label className="composer-label" htmlFor="edit-note-body">
                메모
              </label>
              <textarea
                id="edit-note-body"
                className="composer-note edit-note-modal-note"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="내용을 입력하세요"
                rows={6}
              />
            </div>
            <div className="composer-field">
              <label className="composer-label" htmlFor="edit-note-source">
                출처
              </label>
              <input
                id="edit-note-source"
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
          <div className="edit-note-modal-actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy || deleteConfirmOpen}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              {deleting ? '삭제 중…' : '메모 삭제'}
            </button>
            <button
              type="button"
              className="btn btn--emphasis edit-note-modal-submit"
              disabled={busy || tags.length === 0}
              onClick={() => {
                void (async () => {
                  setSaving(true)
                  setError(null)
                  try {
                    await updateNoteWithTags(
                      note.id,
                      body,
                      tags.map((t) => t.name),
                      userId,
                      [...allTags],
                      source,
                    )
                    await onSaved()
                    onClose()
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : '수정에 실패했습니다.',
                    )
                  } finally {
                    setSaving(false)
                  }
                })()
              }}
            >
              {saving ? '수정 중…' : '수정'}
            </button>
          </div>
        </div>
      </div>
    </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="메모 삭제"
        message="이 메모를 삭제할까요? 삭제한 뒤에는 되돌릴 수 없습니다."
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
            await deleteNote(note.id)
            setDeleteConfirmOpen(false)
            await onSaved()
            onClose()
          } catch (e) {
            setDeleteConfirmOpen(false)
            setError(
              e instanceof Error ? e.message : '삭제에 실패했습니다.',
            )
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}
