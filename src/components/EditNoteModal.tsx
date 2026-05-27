import { useEffect, useId, useRef, useState, startTransition } from 'react'
import { TagComposer, type SelectedTag } from './TagComposer'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteNote,
  updateNoteWithTags,
  type NoteWithTags,
  type TagRow,
} from '../lib/notesApi'
import { onStructuredNoteBodyPaste } from '../lib/pasteNoteFormat'

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

function buildLocalPreviewNote(
  noteId: string,
  createdAt: string,
  body: string,
  source: string,
  tags: SelectedTag[],
): NoteWithTags {
  return {
    id: noteId,
    body: body.trim(),
    source: source.trim(),
    created_at: createdAt,
    note_tags: tags.map((t) => ({
      tag_id: t.id ?? `pending-${t.name}`,
      tags: {
        id: t.id ?? `pending-${t.name}`,
        name: t.name,
        color_index: t.color_index,
      },
    })),
  }
}

type Props = {
  open: boolean
  onClose: () => void
  note: NoteWithTags | null
  allTags: TagRow[]
  userId: string
  /** 화면 즉시 반영(로컬) — 서버 응답 후 한 번 더 호출되어 맞춤 */
  onNoteUpdated: (note: NoteWithTags) => void | Promise<void>
  onUpdateError?: (message: string) => void
  /** 실패 시 서버 기준으로 해당 메모만 다시 불러옴 */
  onSyncNoteFromServer?: (noteId: string) => void | Promise<void>
  onNoteDeleted: (noteId: string) => void | Promise<void>
}

export function EditNoteModal({
  open,
  onClose,
  note,
  allTags,
  userId,
  onNoteUpdated,
  onUpdateError,
  onSyncNoteFromServer,
  onNoteDeleted,
}: Props) {
  const titleId = useId()
  const [tags, setTags] = useState<SelectedTag[]>([])
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const seededNoteIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !note) {
      if (!open) {
        seededNoteIdRef.current = null
      }
      return
    }
    if (seededNoteIdRef.current === note.id) {
      return
    }
    seededNoteIdRef.current = note.id
    startTransition(() => {
      setTags(noteToSelectedTags(note))
      setBody(note.body ?? '')
      setSource(note.source ?? '')
      setError(null)
      setDeleteConfirmOpen(false)
    })
  }, [open, note])

  if (!open || !note) return null

  return (
    <>
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
                onPaste={(e) => {
                  onStructuredNoteBodyPaste(e, body, source, setBody, setSource)
                }}
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
              disabled={deleteConfirmOpen}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              메모 삭제
            </button>
            <button
              type="button"
              className="btn btn--emphasis edit-note-modal-submit"
              disabled={tags.length === 0}
              onClick={() => {
                setError(null)
                const noteId = note.id
                const saveBody = body
                const saveTags = tags.map((t) => t.name)
                const saveSource = source
                const preview = buildLocalPreviewNote(
                  noteId,
                  note.created_at,
                  saveBody,
                  saveSource,
                  tags,
                )
                void onNoteUpdated(preview)
                onClose()
                void (async () => {
                  try {
                    const updated = await updateNoteWithTags(
                      noteId,
                      saveBody,
                      saveTags,
                      userId,
                      [...allTags],
                      saveSource,
                    )
                    await onNoteUpdated(updated)
                  } catch (e) {
                    console.error('[태그노트] EditNoteModal 수정 실패', {
                      noteId,
                      bodyLength: saveBody.length,
                      sourceLength: saveSource.length,
                      tagCount: saveTags.length,
                    }, e)
                    await onSyncNoteFromServer?.(noteId)
                    onUpdateError?.(
                      e instanceof Error ? e.message : '수정에 실패했습니다.',
                    )
                  }
                })()
              }}
            >
              수정
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
        confirmLabel="삭제"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setError(null)
          const noteId = note.id
          void onNoteDeleted(noteId)
          setDeleteConfirmOpen(false)
          onClose()
          void (async () => {
            try {
              await deleteNote(noteId)
            } catch (e) {
              console.error('[태그노트] EditNoteModal 메모 삭제 실패', {
                noteId,
              }, e)
              await onSyncNoteFromServer?.(noteId)
              onUpdateError?.(
                e instanceof Error ? e.message : '삭제에 실패했습니다.',
              )
            }
          })()
        }}
      />
    </>
  )
}
