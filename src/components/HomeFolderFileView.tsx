import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { TagRow } from '../lib/notesApi'
import { displayTagName } from '../lib/tagUtils'

type Props = {
  folders: TagRow[]
  memoCounts: Map<string, number>
  scrollRef: RefObject<HTMLDivElement | null>
  slotRef: (folderId: string, el: HTMLElement | null) => void
  onSelectFolder: (folderId: string) => void
}

const TAB_H = 26
const JOIN = 6
const CORNER = 8
const STROKE = 1
const EDGE = 20
const TAB_PAD = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function folderTabPath(tabLeft: number, tabWidth: number) {
  const y = TAB_H - STROKE / 2
  const top = STROKE / 2
  const start = tabLeft
  const end = tabLeft + tabWidth
  const wallL = start + JOIN
  const wallR = end - JOIN

  return [
    `M ${start} ${y}`,
    `Q ${wallL} ${y} ${wallL} ${y - JOIN}`,
    `L ${wallL} ${top + CORNER}`,
    `Q ${wallL} ${top} ${wallL + CORNER} ${top}`,
    `H ${wallR - CORNER}`,
    `Q ${wallR} ${top} ${wallR} ${top + CORNER}`,
    `L ${wallR} ${y - JOIN}`,
    `Q ${wallR} ${y} ${end} ${y}`,
  ].join(' ')
}

function folderTabFill(tabLeft: number, tabWidth: number) {
  const y = TAB_H - STROKE / 2
  const top = STROKE / 2
  const start = tabLeft
  const end = tabLeft + tabWidth
  const wallL = start + JOIN
  const wallR = end - JOIN

  return [
    `M ${start} ${y + 4}`,
    `L ${start} ${y}`,
    `Q ${wallL} ${y} ${wallL} ${y - JOIN}`,
    `L ${wallL} ${top + CORNER}`,
    `Q ${wallL} ${top} ${wallL + CORNER} ${top}`,
    `H ${wallR - CORNER}`,
    `Q ${wallR} ${top} ${wallR} ${top + CORNER}`,
    `L ${wallR} ${y - JOIN}`,
    `Q ${wallR} ${y} ${end} ${y}`,
    `L ${end} ${y + 4}`,
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
  zIndex,
  onClick,
}: {
  label: string
  count: number
  slot: number
  zIndex: number
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
      style={{ zIndex }}
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
            d={folderTabPath(left, tabWidth)}
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
  memoCounts,
  scrollRef,
  slotRef,
  onSelectFolder,
}: Props) {
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    let startY = 0
    const onStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0
    }
    const onMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? startY
      const dy = y - startY
      const atTop = scroller.scrollTop <= 0
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        event.preventDefault()
      }
    }
    scroller.addEventListener('touchstart', onStart, { passive: true })
    scroller.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      scroller.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
    }
  }, [scrollRef])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollTop = scroller.scrollHeight
  }, [folders.length, scrollRef])

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
            const label = displayTagName(folder.name)
            const memoCount = memoCounts.get(folder.id) ?? 0
            const slot = index % 4
            return (
              <article
                key={folder.id}
                ref={(el) => slotRef(folder.id, el)}
                data-folder-id={folder.id}
                className={`folder-file folder-file--slot-${slot}`}
              >
                <FolderFileRidge
                  label={label}
                  count={memoCount}
                  slot={slot}
                  zIndex={folders.length + index + 1}
                  onClick={() => onSelectFolder(folder.id)}
                />
                <div
                  className="folder-file-card"
                  style={{ zIndex: index + 1 }}
                >
                  <button
                    type="button"
                    className="folder-file-pane"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => onSelectFolder(folder.id)}
                  />
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
