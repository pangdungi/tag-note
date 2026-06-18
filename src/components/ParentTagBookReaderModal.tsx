import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { noteSourceLabel, type NoteWithTags } from '../lib/notesApi'
import { displayTagName } from '../lib/tagUtils'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'

type Props = {
  open: boolean
  onClose: () => void
  parentTagName: string
  notes: NoteWithTags[]
}

export function ParentTagBookReaderModal({
  open,
  onClose,
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

  const sourceLabel = note ? noteSourceLabel(note) : ''
  const body = note?.body?.trim() ?? ''

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
                <div className="parent-tag-book-meta">
                  {tags.length > 0 ? (
                    <div
                      className="parent-tag-book-tags"
                      aria-label="태그"
                    >
                      {tags.map((tg) => (
                        <span
                          key={tg.id}
                          className="parent-tag-book-tag"
                        >
                          {displayTagName(tg.name)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {sourceLabel ? (
                    <p className="parent-tag-book-source">
                      {displaySourceTitle(sourceLabel)}
                    </p>
                  ) : null}
                </div>

                <div className="parent-tag-book-body">
                  <MemoBodyContent
                    as="div"
                    body={body}
                    className={`parent-tag-book-text${
                      !body ? ' parent-tag-book-text--empty' : ''
                    }`}
                    emptyLabel="내용 없음"
                  />
                </div>

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
