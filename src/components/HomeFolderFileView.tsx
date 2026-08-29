import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react'
import tagIconUrl from '../assets/tag-icon.png'
import type { NoteWithTags, SourceRow, TagRow } from '../lib/notesApi'
import { displayTagName } from '../lib/tagUtils'

type InlineNotesPanelProps = {
  tagLabel: string
  tagId: string
  tagCatalog: Map<string, TagRow>
  sourceCatalog: Map<string, SourceRow>
  notes: NoteWithTags[]
  loading: boolean
  onView: (note: NoteWithTags, contextTagId?: string | null) => void
  onTagFilter?: (tagId: string, contextParentId?: string) => void
  sheetLayout?: boolean
  sheetHideParentTagId?: string
  sheetParentTagId?: string
  sheetFolderMode?: boolean
  sheetFolderTagName?: string
  emptyHint?: string
}

type Props = {
  folders: TagRow[]
  expandedId: string | null
  memoCounts: Map<string, number>
  tagCatalog: Map<string, TagRow>
  sourceCatalog: Map<string, SourceRow>
  notes: NoteWithTags[]
  notesLoading: boolean
  canEdit: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  openTracksRef: RefObject<HTMLDivElement | null>
  slotRef: (folderId: string, el: HTMLElement | null) => void
  InlineNotesPanel: ComponentType<InlineNotesPanelProps>
  onSelectFolder: (folderId: string) => void
  onEditFolder: (folder: TagRow) => void
  onViewNote: (note: NoteWithTags, contextTagId?: string | null) => void
  onTagFilter: (tagId: string, contextParentId?: string) => void
}

const TAB_H = 26
const JOIN = 6
const CORNER = 8
const END = 7
const STROKE = 1
const EDGE = 20
const TAB_PAD = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function folderTopPath(
  width: number,
  tabLeft: number,
  tabWidth: number,
) {
  const y = TAB_H - STROKE / 2
  const top = STROKE / 2
  const left = STROKE / 2
  const right = width - STROKE / 2
  const start = tabLeft
  const end = tabLeft + tabWidth
  const wallL = start + JOIN
  const wallR = end - JOIN
  const roundLeft = start > left + END + 4
  const roundRight = end < right - END - 4

  return [
    roundLeft ? `M ${left} ${y + END}` : `M ${left} ${y}`,
    roundLeft ? `Q ${left} ${y} ${left + END} ${y}` : '',
    `H ${start}`,
    `Q ${wallL} ${y} ${wallL} ${y - JOIN}`,
    `L ${wallL} ${top + CORNER}`,
    `Q ${wallL} ${top} ${wallL + CORNER} ${top}`,
    `H ${wallR - CORNER}`,
    `Q ${wallR} ${top} ${wallR} ${top + CORNER}`,
    `L ${wallR} ${y - JOIN}`,
    `Q ${wallR} ${y} ${end} ${y}`,
    roundRight ? `H ${right - END}` : `H ${right}`,
    roundRight ? `Q ${right} ${y} ${right} ${y + END}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function folderTabFill(
  tabLeft: number,
  tabWidth: number,
) {
  const y = TAB_H - STROKE / 2
  const top = STROKE / 2
  const start = tabLeft
  const end = tabLeft + tabWidth
  const wallL = start + JOIN
  const wallR = end - JOIN

  return [
    `M ${start} ${y + 3}`,
    `L ${start} ${y}`,
    `Q ${wallL} ${y} ${wallL} ${y - JOIN}`,
    `L ${wallL} ${top + CORNER}`,
    `Q ${wallL} ${top} ${wallL + CORNER} ${top}`,
    `H ${wallR - CORNER}`,
    `Q ${wallR} ${top} ${wallR} ${top + CORNER}`,
    `L ${wallR} ${y - JOIN}`,
    `Q ${wallR} ${y} ${end} ${y}`,
    `L ${end} ${y + 3}`,
    'Z',
  ].join(' ')
}

function tabOffset(slot: number, width: number, tabWidth: number) {
  if (slot === 1) return width * 0.24
  if (slot === 2) return width - tabWidth - width * 0.24
  if (slot === 3) return width - tabWidth - EDGE
  return EDGE
}

function FolderFileRidge({
  label,
  count,
  slot,
  isOpen,
  onClick,
}: {
  label: string
  count: number
  slot: number
  isOpen: boolean
  onClick: () => void
}) {
  const boxRef = useRef<HTMLButtonElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [geom, setGeom] = useState({ width: 0, textW: 72 })

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
  }, [label, count])

  const tabWidth = Math.max(
    geom.textW + JOIN * 2 + TAB_PAD * 2,
    JOIN * 2 + CORNER * 2 + TAB_PAD * 2 + 36,
  )
  const width = Math.max(geom.width, tabWidth + EDGE * 2)
  const left = clamp(tabOffset(slot, width, tabWidth), EDGE, width - tabWidth - EDGE)
  const ready = geom.width > 0

  return (
    <button
      ref={boxRef}
      type="button"
      className="folder-file-ridge"
      aria-pressed={isOpen}
      aria-expanded={isOpen}
      aria-label={`${label} ${count}`}
      title={label}
      onClick={onClick}
    >
      <span ref={textRef} className="folder-file-tab-probe">
        <span className="folder-file-tab-name">{label}</span>
        <span className="folder-file-tab-count">{count}</span>
      </span>
      {ready ? (
        <svg
          className="folder-file-ridge-svg"
          viewBox={`0 0 ${width} ${TAB_H}`}
          width={width}
          height={TAB_H}
          aria-hidden
        >
          <path d={folderTabFill(left, tabWidth)} fill="#ffffff" />
          <path
            d={folderTopPath(width, left, tabWidth)}
            fill="none"
            stroke="#111111"
            strokeWidth={STROKE}
            strokeLinejoin="round"
            strokeLinecap="butt"
            shapeRendering="geometricPrecision"
          />
        </svg>
      ) : null}
      {ready ? (
        <span
          className="folder-file-tab-text"
          style={{
            left: left + JOIN + TAB_PAD,
            width: tabWidth - JOIN * 2 - TAB_PAD * 2,
          }}
        >
          <span className="folder-file-tab-name">{label}</span>
          <span className="folder-file-tab-count">{count}</span>
        </span>
      ) : null}
    </button>
  )
}

export function HomeFolderFileView({
  folders,
  expandedId,
  memoCounts,
  tagCatalog,
  sourceCatalog,
  notes,
  notesLoading,
  canEdit,
  scrollRef,
  openTracksRef,
  slotRef,
  InlineNotesPanel,
  onSelectFolder,
  onEditFolder,
  onViewNote,
  onTagFilter,
}: Props) {
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return

    if (!expandedId) {
      scroller.scrollTop = scroller.scrollHeight
      return
    }

    const slot = scroller.querySelector<HTMLElement>(
      `[data-folder-id="${expandedId}"]`,
    )
    if (!slot) return
    const scrollerRect = scroller.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    scroller.scrollTo({
      top: scroller.scrollTop + slotRect.top - scrollerRect.top - 12,
      behavior: 'auto',
    })
  }, [expandedId, folders.length, scrollRef])

  return (
    <div className="folder-file-cabinet">
    <div
      ref={scrollRef}
      className="folder-file-stack"
      aria-label="폴더 목록"
    >
      {folders.length === 0 ? (
        <p className="notes-hint folder-file-empty">
          폴더가 없습니다. 아래 + 로 폴더를 추가하세요.
        </p>
      ) : (
        folders.map((folder, index) => {
          const isOpen = expandedId === folder.id
          const label = displayTagName(folder.name)
          const memoCount = memoCounts.get(folder.id) ?? 0
          const slot = index % 4
          return (
            <article
              key={folder.id}
              ref={(el) => slotRef(folder.id, el)}
              data-folder-id={folder.id}
              style={{ zIndex: index + 1 }}
              className={`folder-file folder-file--slot-${slot}${
                isOpen ? ' folder-file--open' : ''
              }`}
            >
              <div className="folder-file-card">
                <FolderFileRidge
                  label={label}
                  count={memoCount}
                  slot={slot}
                  isOpen={isOpen}
                  onClick={() => onSelectFolder(folder.id)}
                />
                {isOpen ? (
                  <div className="folder-file-paper">
                    <div className="folder-file-body">
                      <div className="folder-file-body-bar">
                        <span className="folder-file-body-count">
                          메모 {memoCount}
                        </span>
                        <button
                          type="button"
                          className="folder-file-edit"
                          aria-label={`${label} 폴더 수정`}
                          title="폴더 수정"
                          disabled={!canEdit}
                          onClick={(event) => {
                            event.stopPropagation()
                            onEditFolder(folder)
                          }}
                        >
                          <img
                            src={tagIconUrl}
                            alt=""
                            className="folder-file-edit-icon"
                            width={14}
                            height={14}
                            decoding="async"
                          />
                        </button>
                      </div>
                      <div
                        ref={openTracksRef}
                        className="folder-file-sheet"
                        aria-label={`${label} 관련 메모`}
                      >
                        <InlineNotesPanel
                          tagLabel={label}
                          tagId={folder.id}
                          tagCatalog={tagCatalog}
                          sourceCatalog={sourceCatalog}
                          notes={notes}
                          loading={notesLoading}
                          onView={onViewNote}
                          onTagFilter={onTagFilter}
                          sheetLayout
                          sheetFolderMode
                          sheetHideParentTagId={folder.id}
                          sheetFolderTagName={folder.name}
                          sheetParentTagId={folder.id}
                          emptyHint="이 폴더의 메모가 아직 없습니다."
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="folder-file-pane"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => onSelectFolder(folder.id)}
                  />
                )}
              </div>
            </article>
          )
        })
      )}
    </div>
      <div className="folder-file-drawer" aria-hidden="true">
        <span className="folder-file-drawer-handle" />
      </div>
    </div>
  )
}
