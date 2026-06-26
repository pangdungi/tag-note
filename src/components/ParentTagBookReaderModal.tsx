import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  noteSourceLabel,
  type NoteWithTags,
} from '../lib/notesApi'
import {
  displayTagName,
} from '../lib/tagUtils'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'

type Props = {
  open: boolean
  onClose: () => void
  parentTagId: string
  parentTagName: string
  notes: NoteWithTags[]
}

function formatNoteWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ParentTagBookReaderModal({
  open,
  onClose,
  parentTagId,
  parentTagName,
  notes,
}: Props) {
  const titleId = useId()
  const [pageIndex, setPageIndex] = useState(0)

  const pageCount = notes.length
  const safeIndex =
    pageCount === 0 ? 0 : Math.min(pageIndex, pageCount - 1)
  const note = pageCount > 0 ? notes[safeIndex] : null

  const tags = useMemo(() => {
    if (!note) return []
    return note.note_tags
      .map((nt) => nt.tags)
      .filter(Boolean)
      .sort((a, b) => a!.name.localeCompare(b!.name, 'ko')) as {
      id: string
      name: string
      color_index: number
    }[]
  }, [note])

  const memoOnly = useMemo(() => {
    if (!note || !parentTagId) return false
    const visibleTags = tags.filter((tg) => tg.id !== parentTagId)
    return visibleTags.length === 0
  }, [note, parentTagId, tags])

  const sourceLabel = note ? noteSourceLabel(note) : ''
  const body = note?.body?.trim() ?? ''

  const metaRow = (
    <tr className="note-board-sheet-meta-row">
      <td
        className="note-board-sheet-meta-cell"
        colSpan={memoOnly ? 1 : 2}
      >
        <div className="note-board-sheet-meta">
          <div className="note-board-sheet-meta-right">
            {sourceLabel ? (
              <span className="note-board-card-source">
                {displaySourceTitle(sourceLabel)}
              </span>
            ) : (
              <span className="note-board-sheet-meta-placeholder">
                출처 없음
              </span>
            )}
            {note ? (
              <time
                className="note-board-card-time note-board-sheet-meta-date"
                dateTime={note.created_at}
              >
                {formatNoteWhen(note.created_at)}
              </time>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  )

  useEffect(() => {
    if (open) setPageIndex(0)
  }, [open, parentTagName])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const goPrev = useCallback(() => {
    setPageIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setPageIndex((i) => Math.min(pageCount - 1, i + 1))
  }, [pageCount])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, goPrev, goNext])

  if (!open) return null

  return (
    <div
      className="parent-tag-book-overlay"
      role="presentation"
    >
      <div
        className="parent-tag-book-backdrop"
        aria-hidden="true"
        onClick={() => onClose()}
      />
      <div
        className="parent-tag-book-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="parent-tag-book-toolbar">
          <h2 id={titleId} className="parent-tag-book-toolbar-title">
            {displayTagName(parentTagName)}
          </h2>
          <button
            type="button"
            className="parent-tag-book-close"
            aria-label="책 보기 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </header>

        {pageCount === 0 ? (
          <p className="parent-tag-book-empty">이 상위 태그의 메모가 없습니다.</p>
        ) : (
          <div className="parent-tag-book-stage">
            <button
              type="button"
              className="parent-tag-book-nav parent-tag-book-nav--prev"
              aria-label="이전 메모"
              disabled={safeIndex <= 0}
              onClick={() => goPrev()}
            >
              <span aria-hidden="true">‹</span>
            </button>

            <article className="parent-tag-book-page" aria-live="polite">
              <div className="parent-tag-book-page-inner">
                {memoOnly ? (
                  <table
                    className="note-board-sheet-table note-board-sheet-table--book note-board-sheet-table--memo-only"
                  >
                    <tbody>
                      <tr className="note-board-sheet-body-row">
                        <td
                          className="note-board-sheet-memo-cell note-board-sheet-memo-cell--solo"
                          valign="top"
                        >
                          <div
                            className={`note-board-sheet-memo parent-tag-book-text-wrap${
                              !body ? ' note-board-sheet-memo--empty' : ''
                            }`}
                          >
                            <MemoBodyContent
                              as="div"
                              body={body}
                              className={`parent-tag-book-text${
                                !body ? ' parent-tag-book-text--empty' : ''
                              }`}
                              emptyLabel="내용 없음"
                            />
                          </div>
                        </td>
                      </tr>
                      {metaRow}
                    </tbody>
                  </table>
                ) : (
                  <table className="note-board-sheet-table note-board-sheet-table--book">
                    <tbody>
                      <tr className="note-board-sheet-body-row">
                        <td className="note-board-sheet-tags-cell" valign="top">
                          {tags.filter((tg) => tg.id !== parentTagId).length > 0 ? (
                            <ul className="note-board-sheet-tag-list">
                              {tags
                                .filter((tg) => tg.id !== parentTagId)
                                .map((tg) => (
                                <li
                                  key={tg.id}
                                  className="note-board-sheet-tag-item"
                                >
                                  <span className="note-board-sheet-tag">
                                    {displayTagName(tg.name)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="note-board-sheet-tag note-board-sheet-tag--empty">
                              태그 없음
                            </span>
                          )}
                        </td>
                        <td className="note-board-sheet-memo-cell" valign="top">
                          <div
                            className={`note-board-sheet-memo parent-tag-book-text-wrap${
                              !body ? ' note-board-sheet-memo--empty' : ''
                            }`}
                          >
                            <MemoBodyContent
                              as="div"
                              body={body}
                              className={`parent-tag-book-text${
                                !body ? ' parent-tag-book-text--empty' : ''
                              }`}
                              emptyLabel="내용 없음"
                            />
                          </div>
                        </td>
                      </tr>
                      {metaRow}
                    </tbody>
                  </table>
                )}

                <p className="parent-tag-book-page-indicator">
                  {safeIndex + 1} / {pageCount}
                </p>
              </div>
            </article>

            <button
              type="button"
              className="parent-tag-book-nav parent-tag-book-nav--next"
              aria-label="다음 메모"
              disabled={safeIndex >= pageCount - 1}
              onClick={() => goNext()}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
