import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  startTransition,
} from 'react'
import type { CSSProperties } from 'react'
import { ModalFooter } from './ModalFooter'
import { ModalSelect } from './ModalSelect'
import { ConfirmModal } from './ConfirmModal'
import {
  deleteSourceKeepNotes,
  updateSource,
  type SourceRow,
} from '../lib/notesApi'
import {
  hasSourceSpineImage,
  fileToSpineImage,
  readClipboardSpineImage,
  type SourceSpineImageData,
} from '../lib/sourceSpineImage'
import {
  displaySourceTitle,
  normalizeSourceCategory,
  normalizeSourceTitle,
  SOURCE_CATEGORY_OPTIONS,
  SOURCE_CATEGORY_UNCategorized,
} from '../lib/sourceUtils'

function displaySourceCategory(source: SourceRow): string {
  return source.category?.trim() || SOURCE_CATEGORY_UNCategorized
}

type Props = {
  open: boolean
  onClose: () => void
  source: SourceRow | null
  onSourceUpdated: (row: SourceRow) => void
  onSourceDeleted: (sourceId: string) => void
  onSourceError?: (message: string) => void
  onSyncFromServer?: () => void | Promise<void>
}

function spineFromSource(source: SourceRow): SourceSpineImageData | null {
  if (!hasSourceSpineImage(source)) return null
  return {
    url: source.spine_image_url!,
    width: source.spine_image_width ?? 0,
    height: source.spine_image_height ?? 0,
  }
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
  const categoryId = useId()
  const spineFileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(SOURCE_CATEGORY_UNCategorized)
  const [initialCategory, setInitialCategory] = useState(
    SOURCE_CATEGORY_UNCategorized,
  )
  const [spineImage, setSpineImage] = useState<SourceSpineImageData | null>(
    null,
  )
  const [spineRemoved, setSpineRemoved] = useState(false)
  const [initialSpine, setInitialSpine] = useState<SourceSpineImageData | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pasteBusy, setPasteBusy] = useState(false)

  const categoryOptions = useMemo(() => {
    const base = SOURCE_CATEGORY_OPTIONS.filter(
      (option) => option !== SOURCE_CATEGORY_UNCategorized,
    ).map((option) => ({ value: option, label: option }))
    const current = source?.category?.trim()
    if (
      current &&
      current !== SOURCE_CATEGORY_UNCategorized &&
      !base.some((option) => option.value === current)
    ) {
      return [{ value: current, label: current }, ...base]
    }
    return base
  }, [source?.category])

  const categoryValue =
    category === SOURCE_CATEGORY_UNCategorized ? '' : category

  useEffect(() => {
    if (!open || !source) return
    startTransition(() => {
      const existing = spineFromSource(source)
      const nextCategory = displaySourceCategory(source)
      setTitle(source.title)
      setCategory(nextCategory)
      setInitialCategory(nextCategory)
      setSpineImage(existing)
      setInitialSpine(existing)
      setSpineRemoved(false)
      setError(null)
      setDeleteConfirmOpen(false)
      setSaving(false)
      setPasteBusy(false)
    })
  }, [open, source])

  const applySpineImage = useCallback((next: SourceSpineImageData) => {
    setSpineImage(next)
    setSpineRemoved(false)
  }, [])

  const handlePaste = useCallback(async (clipboard: DataTransfer | null) => {
    setPasteBusy(true)
    setError(null)
    try {
      const next = await readClipboardSpineImage(clipboard)
      if (!next) return false
      applySpineImage(next)
      return true
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '북스파인 이미지를 붙여넣지 못했습니다.',
      )
      return false
    } finally {
      setPasteBusy(false)
    }
  }, [applySpineImage])

  const handleSpineFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      setPasteBusy(true)
      setError(null)
      try {
        applySpineImage(await fileToSpineImage(file))
      } catch (e) {
        setError(
          e instanceof Error ? e.message : '북스파인 이미지를 불러오지 못했습니다.',
        )
      } finally {
        setPasteBusy(false)
      }
    },
    [applySpineImage],
  )

  if (!open || !source) return null

  const titleChanged =
    normalizeSourceTitle(title) !== normalizeSourceTitle(source.title)
  const categoryChanged = category !== initialCategory
  const spineChanged =
    spineRemoved ||
    spineImage?.url !== initialSpine?.url ||
    spineImage?.width !== initialSpine?.width ||
    spineImage?.height !== initialSpine?.height
  const canSave =
    normalizeSourceTitle(title).length > 0 &&
    (titleChanged || categoryChanged || spineChanged)

  const previewStyle = (
    spineImage
      ? {
          '--source-spine-preview-h': `${spineImage.height}px`,
          '--source-spine-preview-w': `${spineImage.width}px`,
          '--source-spine-aspect': String(spineImage.width / spineImage.height),
        }
      : undefined
  ) as CSSProperties | undefined

  return (
    <>
      <div className="tag-manage-overlay tag-manage-overlay--nested" role="presentation">
        <div className="tag-manage-backdrop" aria-hidden="true" />
        <div
          className="tag-manage-dialog tag-manage-dialog--edit-tag tag-manage-dialog--edit-source"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onPaste={(e) => {
            void (async () => {
              const handled = await handlePaste(e.clipboardData)
              if (handled) e.preventDefault()
            })()
          }}
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
                  onPaste={(e) => {
                    void (async () => {
                      const handled = await handlePaste(e.clipboardData)
                      if (handled) e.preventDefault()
                    })()
                  }}
                  placeholder="출처 이름"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>

              <div className="composer-field">
                <label className="composer-label" htmlFor={categoryId}>
                  분야
                </label>
                <ModalSelect
                  id={categoryId}
                  value={categoryValue}
                  options={categoryOptions}
                  emptyLabel={SOURCE_CATEGORY_UNCategorized}
                  disabled={saving || pasteBusy}
                  onChange={(next) =>
                    setCategory(next || SOURCE_CATEGORY_UNCategorized)
                  }
                />
              </div>

              <div className="composer-field source-spine-edit-field">
                <div className="composer-label-row">
                  <span className="composer-label">북스파인 이미지</span>
                  {spineImage ? (
                    <button
                      type="button"
                      className="source-spine-edit-remove"
                      disabled={saving || pasteBusy}
                      onClick={() => {
                        setSpineImage(null)
                        setSpineRemoved(true)
                      }}
                    >
                      이미지 제거
                    </button>
                  ) : null}
                </div>
                <input
                  ref={spineFileInputRef}
                  type="file"
                  accept="image/*"
                  className="source-spine-edit-file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    void handleSpineFile(file)
                    e.target.value = ''
                  }}
                />
                {pasteBusy ? (
                  <p className="notes-hint source-spine-edit-status">이미지 처리 중…</p>
                ) : null}
                {spineImage ? (
                  <div
                    className="source-spine-edit-preview"
                    style={previewStyle}
                  >
                    <img
                      src={spineImage.url}
                      alt={`${displaySourceTitle(title)} 북스파인`}
                      width={spineImage.width}
                      height={spineImage.height}
                    />
                  </div>
                ) : (
                  <div
                    className="source-spine-edit-dropzone"
                    role="button"
                    tabIndex={0}
                    onClick={() => spineFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        spineFileInputRef.current?.click()
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'copy'
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      void handleSpineFile(e.dataTransfer.files[0])
                    }}
                    onPaste={(e) => {
                      void (async () => {
                        const handled = await handlePaste(e.clipboardData)
                        if (handled) e.preventDefault()
                      })()
                    }}
                  >
                    붙여넣기 · 파일 선택 · 끌어다 놓기
                  </div>
                )}
              </div>
            </div>
            {error ? <p className="composer-error">{error}</p> : null}
          </div>
          <ModalFooter>
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
              disabled={!canSave || saving || pasteBusy}
              onClick={() => {
                setError(null)
                setSaving(true)
                const sourceId = source.id
                const saveTitle = title
                const saveCategory = normalizeSourceCategory(category)
                const nextSpine = spineRemoved ? null : spineImage
                const optimistic: SourceRow = {
                  ...source,
                  title: normalizeSourceTitle(saveTitle),
                  category: saveCategory,
                  spine_image_url: nextSpine?.url ?? null,
                  spine_image_width: nextSpine?.width ?? null,
                  spine_image_height: nextSpine?.height ?? null,
                }
                onSourceUpdated(optimistic)
                onClose()
                void (async () => {
                  try {
                    const row = await updateSource(sourceId, {
                      rawTitle: saveTitle,
                      category: saveCategory,
                      spine_image_url: nextSpine?.url ?? null,
                      spine_image_width: nextSpine?.width ?? null,
                      spine_image_height: nextSpine?.height ?? null,
                    })
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
          </ModalFooter>
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
