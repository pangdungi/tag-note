import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  resolveNoteSourceTitle,
  resolveNoteTagChips,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import { displaySourceTitle } from '../lib/sourceUtils'
import { formatHashtagLabel } from '../lib/tagUtils'
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
  folderTagId?: string
  sourceId?: string
  /** 방금 저장한 메모 — 그 장으로 연다 */
  focusNoteId?: string | null
  titleLabel?: string
  folderTab?: boolean
  emptyHint?: string
  tagCatalog: Map<string, TagRow>
  sourceCatalog: Map<string, SourceRow>
  onEdit?: (note: NoteWithTags) => void
  onEditFolder?: () => void
  onTagFilter?: (tagId: string) => void
  onSourceFilter?: (sourceId: string) => void
  onFocusNoteConsumed?: () => void
}

function PaperSheet({
  note,
  sourceId,
  loading,
  emptyHint,
  sourceCatalog,
  onEdit,
  onSourceFilter,
}: {
  note: NoteWithTags | null
  sourceId?: string
  loading?: boolean
  emptyHint: string
  sourceCatalog: Map<string, SourceRow>
  onEdit?: (note: NoteWithTags) => void
  onSourceFilter?: (sourceId: string) => void
}) {
  if (loading && !note) {
    return (
      <div className="tag-memos-flip-sheet">
        <p className="tag-memos-flip-empty">불러오는 중…</p>
      </div>
    )
  }
  if (!note) {
    return (
      <div className="tag-memos-flip-sheet">
        <p className="tag-memos-flip-empty">{emptyHint}</p>
      </div>
    )
  }

  const src = resolveNoteSourceTitle(note, sourceCatalog)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const hideSource = Boolean(sourceId && srcId === sourceId)
  const body = note.body?.trim() ?? ''
  const canEdit = Boolean(onEdit) && !loading

  return (
    <div
      className={`tag-memos-flip-sheet${
        canEdit ? ' tag-memos-flip-sheet--edit' : ''
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
      <MemoBodyContent
        as="div"
        body={loading ? '' : body}
        className={`tag-memos-flip-text${
          !body && !loading ? ' tag-memos-flip-text--empty' : ''
        }`}
        emptyLabel={loading ? '불러오는 중…' : '내용 없음'}
      />
      <div className="tag-memos-flip-meta">
        {src && !hideSource ? (
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
            <span>{displaySourceTitle(src)}</span>
          )
        ) : null}
        <time dateTime={note.created_at}>{formatNoteWhen(note.created_at)}</time>
      </div>
    </div>
  )
}

const FOLDER_TAB_H = 28
const FOLDER_TAB_JOIN = 6
const FOLDER_TAB_CORNER = 8
const FOLDER_TAB_STROKE = 1.25
const FOLDER_TAB_PAD = 10

function folderPageTabPath(width: number, tabLeft: number, tabWidth: number) {
  const y = FOLDER_TAB_H - FOLDER_TAB_STROKE / 2
  const top = FOLDER_TAB_STROKE / 2
  const start = tabLeft
  const end = tabLeft + tabWidth
  const wallL = start + FOLDER_TAB_JOIN
  const wallR = end - FOLDER_TAB_JOIN
  return [
    `M 0 ${y}`,
    `H ${start}`,
    `Q ${wallL} ${y} ${wallL} ${y - FOLDER_TAB_JOIN}`,
    `L ${wallL} ${top + FOLDER_TAB_CORNER}`,
    `Q ${wallL} ${top} ${wallL + FOLDER_TAB_CORNER} ${top}`,
    `H ${wallR - FOLDER_TAB_CORNER}`,
    `Q ${wallR} ${top} ${wallR} ${top + FOLDER_TAB_CORNER}`,
    `L ${wallR} ${y - FOLDER_TAB_JOIN}`,
    `Q ${wallR} ${y} ${end} ${y}`,
    `H ${width}`,
  ].join(' ')
}

function FolderPageTabHead({
  title,
  extraTags,
  onTagFilter,
  onEditFolder,
}: {
  title: string
  extraTags: TagRow[]
  onTagFilter?: (tagId: string) => void
  onEditFolder?: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLHeadingElement>(null)
  const [geom, setGeom] = useState({ width: 0, textW: 80 })

  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text) return
    const update = () => {
      setGeom({
        width: box.clientWidth,
        textW: Math.ceil(text.getBoundingClientRect().width),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(box)
    observer.observe(text)
    return () => observer.disconnect()
  }, [title])

  const tabWidth = Math.max(
    geom.textW + FOLDER_TAB_JOIN * 2 + FOLDER_TAB_PAD * 2,
    64,
  )
  const width = Math.max(geom.width, tabWidth + 8)
  const tabLeft = 0
  const ready = geom.width > 0

  return (
    <div
      className={`folder-memos-page-tab${
        extraTags.length > 0 ? ' folder-memos-page-tab--tags' : ''
      }`}
      ref={boxRef}
    >
      <h2 ref={textRef} className="folder-memos-page-tab-probe">
        {title}
      </h2>
      {ready ? (
        <svg
          className="folder-memos-page-tab-svg"
          viewBox={`0 0 ${width} ${FOLDER_TAB_H}`}
          width={width}
          height={FOLDER_TAB_H}
          aria-hidden
        >
          <path
            d={folderPageTabPath(width, tabLeft, tabWidth)}
            fill="none"
            stroke="#111111"
            strokeWidth={FOLDER_TAB_STROKE}
            strokeLinejoin="round"
            strokeLinecap="butt"
            shapeRendering="geometricPrecision"
          />
        </svg>
      ) : null}
      {ready ? (
        <h2
          className="folder-memos-page-tab-title"
          style={{
            left: tabLeft + FOLDER_TAB_JOIN + FOLDER_TAB_PAD,
            width: tabWidth - FOLDER_TAB_JOIN * 2 - FOLDER_TAB_PAD * 2,
          }}
        >
          {title}
        </h2>
      ) : null}
      {onEditFolder ? (
        <button
          type="button"
          className="folder-memos-page-tab-edit"
          aria-label="폴더 수정"
          title="폴더 수정"
          onClick={onEditFolder}
        >
          <svg
            className="folder-memos-page-tab-edit-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.99-1.66z"
            />
          </svg>
        </button>
      ) : null}
      {extraTags.length > 0 ? (
        <div className="folder-memos-page-tags folder-memos-page-tab-tags">
          {extraTags.map((tg) =>
            onTagFilter ? (
              <button
                key={tg.id}
                type="button"
                className="folder-memos-page-tag"
                onClick={() => onTagFilter(tg.id)}
              >
                {formatHashtagLabel(tg.name)}
              </button>
            ) : (
              <span key={tg.id} className="folder-memos-page-tag">
                {formatHashtagLabel(tg.name)}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

export function FolderMemosView({
  notes,
  loading,
  folderTagId,
  sourceId,
  focusNoteId,
  titleLabel,
  folderTab = false,
  emptyHint = '이 폴더의 메모가 아직 없습니다.',
  tagCatalog,
  sourceCatalog,
  onEdit,
  onEditFolder,
  onTagFilter,
  onSourceFilter,
  onFocusNoteConsumed,
}: Props) {
  const [index, setIndex] = useState(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const skipEditClick = useRef(false)
  const openKey = `${folderTagId ?? ''}|${sourceId ?? ''}`
  const seededOpenKey = useRef('')

  useLayoutEffect(() => {
    if (focusNoteId) {
      const focused = notes.findIndex((n) => n.id === focusNoteId)
      if (focused >= 0) {
        setIndex(focused)
        onFocusNoteConsumed?.()
        seededOpenKey.current = openKey
        return
      }
    }
    if (seededOpenKey.current !== openKey) {
      if (notes.length === 0) {
        setIndex(0)
        return
      }
      seededOpenKey.current = openKey
      setIndex(notes.length - 1)
      return
    }
    if (notes.length === 0) {
      setIndex(0)
      return
    }
    setIndex((cur) => Math.min(cur, notes.length - 1))
  }, [openKey, notes, focusNoteId, onFocusNoteConsumed])

  const note = notes[index] ?? null
  const extraTags = useMemo(() => {
    if (!note) return []
    return [...resolveNoteTagChips(note, tagCatalog)]
      .filter((t) => t.id !== folderTagId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [note, folderTagId, tagCatalog])
  const count = notes.length
  const hasPrev = index > 0
  const hasNext = index < count - 1
  const showNav = count > 0

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

  return (
    <div
      className="folder-memos-view folder-memos-view--page folder-memos-view--flip"
      aria-busy={loading}
      aria-label="메모 페이지"
      onTouchStart={(event) => {
        const t = event.changedTouches[0]
        if (!t) return
        touchStart.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        touchStart.current = null
        const t = event.changedTouches[0]
        if (!start || !t || count < 2) return
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
      <div className="tag-memos-flip-dialog folder-memos-flip-dialog">
        {folderTab && titleLabel ? (
          <FolderPageTabHead
            title={titleLabel}
            extraTags={extraTags}
            onTagFilter={onTagFilter}
            onEditFolder={onEditFolder}
          />
        ) : titleLabel || extraTags.length > 0 ? (
          <div className="tag-memos-flip-head folder-memos-page-head">
            {titleLabel ? (
              <h2 className="tag-memos-flip-title">{titleLabel}</h2>
            ) : null}
            {extraTags.length > 0 ? (
              <div className="folder-memos-page-tags" aria-label="함께 붙은 태그">
                {extraTags.map((tg) =>
                  onTagFilter ? (
                    <button
                      key={tg.id}
                      type="button"
                      className="folder-memos-page-tag"
                      onClick={() => onTagFilter(tg.id)}
                    >
                      {formatHashtagLabel(tg.name)}
                    </button>
                  ) : (
                    <span key={tg.id} className="folder-memos-page-tag">
                      {formatHashtagLabel(tg.name)}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="tag-memos-flip-stage">
          <div className="tag-memos-flip-page tag-memos-flip-page--front">
            <PaperSheet
              note={note}
              sourceId={sourceId}
              loading={loading}
              emptyHint={emptyHint}
              sourceCatalog={sourceCatalog}
              onEdit={onEdit}
              onSourceFilter={onSourceFilter}
            />
          </div>
        </div>
        {showNav ? (
          <div className="tag-memos-flip-nav">
            <button
              type="button"
              className="tag-memos-flip-nav-btn"
              disabled={!hasPrev || loading}
              onClick={() => goBy(-1)}
            >
              이전
            </button>
            <span className="tag-memos-flip-count" aria-live="polite">
              {loading && count === 0 ? '0 / 0' : `${index + 1} / ${count}`}
            </span>
            <button
              type="button"
              className="tag-memos-flip-nav-btn"
              disabled={!hasNext || loading}
              onClick={() => goBy(1)}
            >
              다음
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
