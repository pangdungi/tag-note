import { useEffect, useMemo, useRef, useState } from 'react'
import {
  resolveNoteTagChips,
  resolveNoteSourceTitle,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName } from '../lib/tagUtils'
import { displaySourceTitle } from '../lib/sourceUtils'
import { MemoBodyContent } from './MemoBodyContent'

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

type Props = {
  notes: NoteWithTags[]
  loading: boolean
  folderTagId: string
  tagCatalog: Map<string, TagRow>
  sourceCatalog: Map<string, SourceRow>
  onEdit?: (note: NoteWithTags) => void
  onTagFilter?: (tagId: string) => void
  onSourceFilter?: (sourceId: string) => void
}

function useNoteChrome(
  note: NoteWithTags | null,
  folderTagId: string,
  tagCatalog: Map<string, TagRow>,
) {
  return useMemo(() => {
    if (!note) {
      return [] as { id: string; name: string; color_index: number }[]
    }
    const sortedTags = [...resolveNoteTagChips(note, tagCatalog)].sort((a, b) =>
      a.name.localeCompare(b.name, 'ko'),
    )
    const resolvedPrimary =
      sortedTags.find((t) => t.id === folderTagId) ?? sortedTags[0] ?? null
    return resolvedPrimary
      ? sortedTags.filter((t) => t.id !== resolvedPrimary.id)
      : []
  }, [note, folderTagId, tagCatalog])
}

function FolderMemoArticle({
  note,
  folderTagId,
  tagCatalog,
  sourceCatalog,
  loading,
  onEdit,
  onTagFilter,
  onSourceFilter,
}: {
  note: NoteWithTags
  folderTagId: string
  tagCatalog: Map<string, TagRow>
  sourceCatalog: Map<string, SourceRow>
  loading?: boolean
  onEdit?: (note: NoteWithTags) => void
  onTagFilter?: (tagId: string) => void
  onSourceFilter?: (sourceId: string) => void
}) {
  const otherTags = useNoteChrome(note, folderTagId, tagCatalog)
  const src = resolveNoteSourceTitle(note, sourceCatalog)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''
  const canEdit = Boolean(onEdit) && !loading

  return (
    <article
      className={`folder-memos-article${
        canEdit ? ' folder-memos-article--edit' : ''
      }`}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? '메모 수정' : undefined}
      onClick={() => {
        if (canEdit) onEdit?.(note)
      }}
      onKeyDown={(event) => {
        if (!canEdit) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit?.(note)
        }
      }}
    >
      {otherTags.length > 0 ? (
        <div className="folder-memos-article-tags" aria-label="함께 붙은 태그">
          {otherTags.map((tg) =>
            onTagFilter ? (
              <button
                key={tg.id}
                type="button"
                className="note-board-tag-pill note-board-tag-pill--link"
                onClick={(event) => {
                  event.stopPropagation()
                  onTagFilter(tg.id)
                }}
              >
                {displayTagName(tg.name)}
              </button>
            ) : (
              <span key={tg.id} className="note-board-tag-pill">
                {displayTagName(tg.name)}
              </span>
            ),
          )}
        </div>
      ) : null}
      <MemoBodyContent
        as="div"
        body={loading ? '' : body}
        className={`note-view-modal-text${
          !body && !loading ? ' note-view-modal-text--empty' : ''
        }`}
        emptyLabel={loading ? '불러오는 중…' : '내용 없음'}
      />
      <div className="note-view-modal-meta">
        {src ? (
          srcId && onSourceFilter ? (
            <button
              type="button"
              className="note-view-modal-source"
              onClick={(event) => {
                event.stopPropagation()
                onSourceFilter(srcId)
              }}
            >
              {displaySourceTitle(src)}
            </button>
          ) : (
            <span className="note-view-modal-source-static">
              {displaySourceTitle(src)}
            </span>
          )
        ) : null}
        <time dateTime={note.created_at}>{formatNoteWhen(note.created_at)}</time>
      </div>
    </article>
  )
}

export function FolderMemosView({
  notes,
  loading,
  folderTagId,
  tagCatalog,
  sourceCatalog,
  onEdit,
  onTagFilter,
  onSourceFilter,
}: Props) {
  const [index, setIndex] = useState(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const skipEditClick = useRef(false)

  useEffect(() => {
    setIndex(0)
  }, [folderTagId])

  useEffect(() => {
    if (notes.length === 0) {
      setIndex(0)
      return
    }
    setIndex((cur) => Math.min(cur, notes.length - 1))
  }, [notes.length])

  const note = notes[index] ?? null
  const hasPrev = index > 0
  const hasNext = index < notes.length - 1
  const showNav = notes.length > 1

  function goBy(delta: number) {
    setIndex((cur) => {
      const next = cur + delta
      if (next < 0 || next >= notes.length) return cur
      return next
    })
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      goBy(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notes.length])

  if (loading && notes.length === 0) {
    return (
      <div className="folder-memos-view folder-memos-view--page" aria-busy="true" aria-label="폴더 메모">
        <div className="folder-memos-page">
          <div className="folder-memos-page-block">
            <p className="notes-hint folder-memos-empty">불러오는 중…</p>
          </div>
        </div>
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="folder-memos-view folder-memos-view--page" aria-label="폴더 메모">
        <div className="folder-memos-page">
          <div className="folder-memos-page-block">
            <p className="notes-hint folder-memos-empty">
              이 폴더의 메모가 아직 없습니다.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="folder-memos-view folder-memos-view--page"
      aria-label="폴더 메모 페이지"
      onTouchStart={(event) => {
        const t = event.changedTouches[0]
        if (!t) return
        touchStart.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        touchStart.current = null
        const t = event.changedTouches[0]
        if (!start || !t || !showNav) return
        const dx = t.clientX - start.x
        const dy = t.clientY - start.y
        if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return
        skipEditClick.current = true
        goBy(dx < 0 ? 1 : -1)
      }}
      onClickCapture={(event) => {
        if (!skipEditClick.current) return
        skipEditClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {showNav ? (
        <button
          type="button"
          className="note-view-nav note-view-nav--prev"
          aria-label="이전 메모"
          disabled={!hasPrev}
          onClick={() => goBy(-1)}
        >
          &lt;
        </button>
      ) : null}
      {showNav ? (
        <button
          type="button"
          className="note-view-nav note-view-nav--next"
          aria-label="다음 메모"
          disabled={!hasNext}
          onClick={() => goBy(1)}
        >
          &gt;
        </button>
      ) : null}
      {note ? (
        <div className="folder-memos-page">
          <div className="folder-memos-page-block">
            <FolderMemoArticle
              note={note}
              folderTagId={folderTagId}
              tagCatalog={tagCatalog}
              sourceCatalog={sourceCatalog}
              loading={loading}
              onEdit={onEdit}
              onTagFilter={onTagFilter}
              onSourceFilter={onSourceFilter}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
