import { useEffect, useId, useRef, useState, startTransition } from 'react'
import { TagComposer, type SelectedTag } from './TagComposer'
import { SourceComposer, type SelectedSource } from './SourceComposer'
import {
  createNoteWithTags,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import { MemoNoteEditor } from './MemoNoteEditor'

type SavedOptions = {
  /** 서버 저장 성공 후 임시(로컬) 메모 id를 교체할 때 */
  replacingId?: string
}

type Props = {
  open: boolean
  onClose: () => void
  /** 열릴 때 태그칩에 미리 넣을 값(검색으로 새 태그 추가 등) */
  initialTags: SelectedTag[]
  allTags: TagRow[]
  allSources: SourceRow[]
  userId: string
  onSaved: (note: NoteWithTags, options?: SavedOptions) => void | Promise<void>
  onSaveFailed?: (tempId: string) => void | Promise<void>
  onSaveError?: (message: string) => void
}

function buildLocalPreviewNote(
  tempId: string,
  body: string,
  source: SelectedSource | null,
  tags: SelectedTag[],
): NoteWithTags {
  const srcTitle = source?.title.trim() ?? ''
  return {
    id: tempId,
    body: body.trim(),
    source: srcTitle,
    source_id: source?.id ?? null,
    sources: source?.id && srcTitle
      ? { id: source.id, title: srcTitle }
      : null,
    created_at: new Date().toISOString(),
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

export function AddNoteModal({
  open,
  onClose,
  initialTags,
  allTags,
  allSources,
  userId,
  onSaved,
  onSaveFailed,
  onSaveError,
}: Props) {
  const titleId = useId()
  const idBase = useId()
  const bodyId = `${idBase}-body`

  const [tags, setTags] = useState<SelectedTag[]>([])
  const [body, setBody] = useState('')
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 저장 클릭 시 검증: 태그 영역 또는 메모 아래 안내 */
  const [fieldHint, setFieldHint] = useState<'tags' | 'body' | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) {
      return
    }
    wasOpenRef.current = true
    const seed = initialTags
    startTransition(() => {
      setTags(seed.map((t) => ({ ...t })))
      setBody('')
      setSelectedSource(null)
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
              <MemoNoteEditor
                id={bodyId}
                className="edit-note-modal-note"
                value={body}
                onChange={(next) => {
                  setBody(next)
                  setFieldHint((h) => (h === 'body' ? null : h))
                }}
                source={selectedSource?.title ?? ''}
                onSourceChange={(title) => {
                  const t = title.trim()
                  setSelectedSource(t ? { title: t } : null)
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
            <SourceComposer
              allSources={allSources}
              selected={selectedSource}
              onChange={setSelectedSource}
            />
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
                const saveSource = selectedSource?.title ?? ''
                const tempId = crypto.randomUUID()
                const preview = buildLocalPreviewNote(
                  tempId,
                  saveBody,
                  selectedSource,
                  tags,
                )
                void onSaved(preview)
                onClose()
                void (async () => {
                  try {
                    const note = await createNoteWithTags(
                      saveBody,
                      saveTags,
                      userId,
                      [...allTags],
                      saveSource,
                      [...allSources],
                    )
                    await onSaved(note, { replacingId: tempId })
                  } catch (e) {
                    console.error('[태그노트] AddNoteModal 저장 실패', {
                      tempId,
                      bodyLength: saveBody.length,
                      sourceLength: saveSource.length,
                      tagCount: saveTags.length,
                    }, e)
                    await onSaveFailed?.(tempId)
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
