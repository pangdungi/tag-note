import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import {
  deleteTagAndLinkedNotes,
  filterTagsByMainSearch,
  updateTag,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput, TAG_COLOR_COUNT } from '../lib/tagUtils'

type Props = {
  open: boolean
  onClose: () => void
  tags: TagRow[]
  onReload: () => Promise<void>
  onDeletedTagId: (tagId: string) => void
}

function subscribeFinePointerHover(mq: MediaQueryList, cb: () => void) {
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** 마우스+호버 환경이면 true — 수정·삭제는 호버 시에만 노출 */
function usePrefersFinePointerHover(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
      return subscribeFinePointerHover(mq, cb)
    },
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    () => true,
  )
}

export function TagManageModal({
  open,
  onClose,
  tags,
  onReload,
  onDeletedTagId,
}: Props) {
  const titleId = useId()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null)
  const [tapRevealedRowId, setTapRevealedRowId] = useState<string | null>(null)

  const prefersHoverReveal = usePrefersFinePointerHover()
  const tapToRevealEdit = !prefersHoverReveal

  const filtered = useMemo(() => filterTagsByMainSearch(tags, q), [tags, q])

  const resetTransient = useCallback(() => {
    setEditingId(null)
    setEditDraft('')
    setDeleteTarget(null)
    setError(null)
    setTapRevealedRowId(null)
  }, [])

  useEffect(() => {
    if (!open) {
      setQ('')
      resetTransient()
      setBusy(false)
    }
  }, [open, resetTransient])

  useEffect(() => {
    setTapRevealedRowId(null)
  }, [q])

  useEffect(() => {
    if (!open || !tapToRevealEdit || !tapRevealedRowId) return
    function onPointerDown(ev: PointerEvent) {
      const el = document.querySelector(
        `[data-tag-manage-row="${tapRevealedRowId}"]`,
      )
      if (el && !el.contains(ev.target as Node)) {
        setTapRevealedRowId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, tapRevealedRowId, tapToRevealEdit])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (tapRevealedRowId) {
        setTapRevealedRowId(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, tapRevealedRowId])

  async function handleSaveEdit(tagId: string) {
    setError(null)
    setBusy(true)
    try {
      await updateTag(tagId, editDraft)
      setEditingId(null)
      setEditDraft('')
      setTapRevealedRowId(null)
      await onReload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setError(null)
    setBusy(true)
    try {
      const id = deleteTarget.id
      await deleteTagAndLinkedNotes(id)
      onDeletedTagId(id)
      setDeleteTarget(null)
      await onReload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

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
        className={
          tapToRevealEdit
            ? 'tag-manage-dialog tag-manage-dialog--tap-edit'
            : 'tag-manage-dialog'
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            태그 관리
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="태그 관리 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>

        <div className="tag-manage-search-wrap">
          <span className="sr-only">태그 목록 검색</span>
          <svg
            className="home-search-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            className="tag-manage-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="태그 이름 검색"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error ? <p className="tag-manage-error">{error}</p> : null}

        {filtered.length === 0 ? (
          <p className="tag-manage-empty">표시할 태그가 없습니다.</p>
        ) : (
          <ul className="tag-manage-list">
            {filtered.map((t) => (
              <li
                key={t.id}
                className={
                  tapToRevealEdit && tapRevealedRowId === t.id
                    ? 'tag-manage-item tag-manage-item--reveal-actions'
                    : 'tag-manage-item'
                }
                data-tag-manage-row={t.id}
              >
                {editingId === t.id ? (
                  <div className="tag-manage-edit-row">
                    <input
                      type="text"
                      className="tag-manage-edit-input"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      disabled={busy}
                      autoFocus
                    />
                    <div className="tag-manage-edit-actions">
                      <button
                        type="button"
                        className="btn btn--quiet"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(null)
                          setEditDraft('')
                          setTapRevealedRowId(null)
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="btn btn--emphasis"
                        disabled={
                          busy || !normalizeTagInput(editDraft)
                        }
                        onClick={() => void handleSaveEdit(t.id)}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : deleteTarget?.id === t.id ? (
                  <div className="tag-manage-delete-panel">
                    <p className="tag-manage-delete-title">이 태그를 삭제할까요?</p>
                    <p className="tag-manage-delete-name">
                      {displayTagName(t.name)}
                    </p>
                    <p className="tag-manage-delete-warn">
                      이 태그가 붙어 있는 메모는 모두 함께 삭제됩니다. 다른 태그가
                      함께 붙어 있어도 메모 전체가 지워집니다. 삭제 후에는
                      다시 복구할 수 없습니다.
                    </p>
                    <div className="tag-manage-delete-actions">
                      <button
                        type="button"
                        className="btn btn--quiet"
                        disabled={busy}
                        onClick={() => setDeleteTarget(null)}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="btn btn--emphasis tag-manage-delete-confirm"
                        disabled={busy}
                        onClick={() => void handleConfirmDelete()}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="tag-manage-row">
                    <div
                      className={
                        tapToRevealEdit
                          ? 'tag-manage-row-main tag-manage-row-main--tappable'
                          : 'tag-manage-row-main'
                      }
                      role={tapToRevealEdit ? 'button' : undefined}
                      tabIndex={tapToRevealEdit ? 0 : undefined}
                      aria-expanded={
                        tapToRevealEdit
                          ? tapRevealedRowId === t.id
                          : undefined
                      }
                      aria-label={
                        tapToRevealEdit
                          ? '탭하면 수정·삭제 표시'
                          : undefined
                      }
                      onClick={(ev) => {
                        if (!tapToRevealEdit || busy) return
                        ev.stopPropagation()
                        setTapRevealedRowId((cur) =>
                          cur === t.id ? null : t.id,
                        )
                      }}
                      onKeyDown={(ev) => {
                        if (!tapToRevealEdit || busy) return
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault()
                          setTapRevealedRowId((cur) =>
                            cur === t.id ? null : t.id,
                          )
                        }
                      }}
                    >
                      <span
                        className={`tag-manage-pill tag-tone-${t.color_index % TAG_COLOR_COUNT}`}
                        title={displayTagName(t.name)}
                      >
                        {displayTagName(t.name)}
                      </span>
                    </div>
                    <div className="tag-manage-text-actions">
                      <span className="tag-manage-reveal-actions">
                        <button
                          type="button"
                          className="tag-manage-text-action"
                          disabled={busy}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setDeleteTarget(null)
                            setTapRevealedRowId(null)
                            setEditingId(t.id)
                            setEditDraft(t.name)
                          }}
                        >
                          이름 수정
                        </button>
                        <span className="tag-manage-action-sep" aria-hidden>
                          ·
                        </span>
                        <button
                          type="button"
                          className="tag-manage-text-action tag-manage-text-action--danger"
                          disabled={busy}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setEditingId(null)
                            setDeleteTarget(t)
                            setTapRevealedRowId(null)
                          }}
                        >
                          삭제
                        </button>
                      </span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
