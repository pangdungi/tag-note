import { useEffect, useId, useRef, useState, startTransition } from 'react'
import { TagComposer, type SelectedTag } from './TagComposer'
import { SourceComposer, type SelectedSource } from './SourceComposer'
import { MemoParentTagSelect } from './MemoParentTagSelect'
import {
  createNoteWithTags,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import {
  inferParentTagIdFromTagIds,
  normalizeTagInput,
  type TagParentLink,
} from '../lib/tagUtils'
import { MemoNoteEditor } from './MemoNoteEditor'

type SavedOptions = {
  /** 서버 저장 성공 후 임시(로컬) 메모 id를 교체할 때 */
  replacingId?: string
}

type Props = {
  open: boolean
  onClose: () => void
  /** 열릴 때 태그칩에 미리 넣을 값 */
  initialTags: SelectedTag[]
  /** 상위태그 spine 클릭 맥락 — 상위태그 칩·제목 고정, 상위 선택 UI 숨김 */
  lockedParentTagId?: string | null
  /** 상위 아래 하위 a 선택 후 + — a만 태그, 상위 지정 UI 숨김 */
  childTagCompose?: boolean
  allTags: TagRow[]
  tagParentLinks?: TagParentLink[]
  allSources: SourceRow[]
  userId: string
  onSaved: (note: NoteWithTags, options?: SavedOptions) => void | Promise<void>
  onSaveFailed?: (tempId: string) => void | Promise<void>
  onSaveError?: (message: string) => void
}

function buildSeedTags(
  initialTags: SelectedTag[],
  lockedParentTagId: string | null | undefined,
  allTags: TagRow[],
): SelectedTag[] {
  const seed = initialTags.map((t) => ({ ...t }))
  if (!lockedParentTagId) return seed
  const parent = allTags.find((t) => t.id === lockedParentTagId)
  const name = normalizeTagInput(parent?.name ?? '')
  if (!name) return seed
  const already = seed.some(
    (t) =>
      t.id === lockedParentTagId ||
      normalizeTagInput(t.name).toLowerCase() === name.toLowerCase(),
  )
  if (already) return seed
  seed.unshift({
    id: lockedParentTagId,
    name,
    color_index: parent?.color_index ?? 0,
  })
  return seed
}

function resolveSaveTagNames(
  tags: SelectedTag[],
  lockedParentTagId: string | null | undefined,
  allTags: TagRow[],
): string[] {
  const names = tags.map((t) => normalizeTagInput(t.name)).filter(Boolean)
  if (!lockedParentTagId) return names
  const parent = allTags.find((t) => t.id === lockedParentTagId)
  const parentName = normalizeTagInput(parent?.name ?? '')
  if (
    parentName &&
    !names.some((n) => n.toLowerCase() === parentName.toLowerCase())
  ) {
    names.unshift(parentName)
  }
  return names
}

function buildLocalPreviewNote(
  tempId: string,
  body: string,
  source: SelectedSource | null,
  tags: SelectedTag[],
  allTags: TagRow[],
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
    note_tags: tags.map((t) => {
      const tagId = t.id ?? `pending-${t.name}`
      const persisted = allTags.find((row) => row.id === t.id)
      return {
        tag_id: tagId,
        tags: {
          id: tagId,
          name: t.name,
          color_index: t.color_index,
          parent_id: persisted?.parent_id ?? null,
        },
      }
    }),
  }
}

export function AddNoteModal({
  open,
  onClose,
  initialTags,
  lockedParentTagId = null,
  childTagCompose = false,
  allTags,
  tagParentLinks,
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
  const [parentTagId, setParentTagId] = useState('')
  const [body, setBody] = useState('')
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldHint, setFieldHint] = useState<'tags' | 'body' | null>(null)
  const wasOpenRef = useRef(false)
  const allTagsRef = useRef(allTags)
  const initialTagsRef = useRef(initialTags)
  const tagParentLinksRef = useRef(tagParentLinks)
  allTagsRef.current = allTags
  initialTagsRef.current = initialTags
  tagParentLinksRef.current = tagParentLinks

  const showParentPicker = !lockedParentTagId && !childTagCompose
  const lockedParent = lockedParentTagId
    ? allTags.find((t) => t.id === lockedParentTagId)
    : null
  const lockedParentName = lockedParent
    ? normalizeTagInput(lockedParent.name)
    : ''

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) {
      return
    }
    wasOpenRef.current = true
    const seed = buildSeedTags(
      initialTagsRef.current,
      lockedParentTagId,
      allTagsRef.current,
    )
    const seedIds = seed.map((t) => t.id).filter(Boolean) as string[]
    startTransition(() => {
      setTags(seed)
      setParentTagId(
        lockedParentTagId
          ? lockedParentTagId
          : childTagCompose
            ? ''
            : inferParentTagIdFromTagIds(
                seedIds,
                allTagsRef.current,
                tagParentLinksRef.current,
              ),
      )
      setBody('')
      setSelectedSource(null)
      setError(null)
      setFieldHint(null)
    })
  }, [open, lockedParentTagId, childTagCompose])

  if (!open) return null

  const composerSaveReady =
    body.trim().length > 0 &&
    (tags.length > 0 || Boolean(lockedParentTagId && lockedParentName))

  const modalTitle = lockedParentName || '메모 추가'

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
            {showParentPicker ? (
              <MemoParentTagSelect
                allTags={allTags}
                tagParentLinks={tagParentLinks}
                value={parentTagId}
                onChange={setParentTagId}
              />
            ) : null}
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
                scrollClamp
              />
              {fieldHint === 'body' ? (
                <p className="composer-field-hint" role="status">
                  메모를 입력해 주세요.
                </p>
              ) : null}
            </div>
          </div>
          {error ? <p className="composer-error">{error}</p> : null}
        </div>
        <div className="edit-note-modal-source">
          <SourceComposer
            allSources={allSources}
            selected={selectedSource}
            onChange={setSelectedSource}
            suggestPlacement="up"
          />
        </div>
        <div className="edit-note-modal-actions edit-note-modal-actions--add-only">
          <button
            type="button"
            className={`btn btn--emphasis${
              composerSaveReady ? ' btn--composer-ready' : ''
            }`}
            onClick={() => {
                setError(null)
                const saveTags = resolveSaveTagNames(
                  tags,
                  lockedParentTagId,
                  allTags,
                )
                if (saveTags.length === 0) {
                  setFieldHint('tags')
                  return
                }
                if (!body.trim()) {
                  setFieldHint('body')
                  return
                }
                setFieldHint(null)
                const saveBody = body
                const saveSource = selectedSource?.title ?? ''
                const tempId = crypto.randomUUID()
                const previewTags: SelectedTag[] = saveTags.map((name) => {
                  const hit = allTags.find(
                    (t) =>
                      t.name.toLowerCase() === name.toLowerCase() || t.name === name,
                  )
                  return {
                    id: hit?.id,
                    name,
                    color_index: hit?.color_index ?? 0,
                  }
                })
                const preview = buildLocalPreviewNote(
                  tempId,
                  saveBody,
                  selectedSource,
                  previewTags,
                  allTags,
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
  )
}
