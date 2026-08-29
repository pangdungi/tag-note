import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { TagRow } from '../lib/notesApi'
import { formatHashtagLabel, TAG_VIEW_NONE_ID } from '../lib/tagUtils'

const ANGLE_STEP = 0.12
const ITEM_STRIDE = 52
const VISIBLE_RAD = 0.7
const START_ANGLE = -0.42
const LEFT = 48
const PAD_Y = 0.22
const PAD_UNITS = -START_ANGLE / ANGLE_STEP
const PAD_PX = PAD_UNITS * ITEM_STRIDE
const END_PAD = ITEM_STRIDE * 3

type SpiralItem = {
  id: string
  label: string
  count: number
}

type Props = {
  tags: TagRow[]
  selectedId: string | null
  memoCounts: Map<string, number>
  noneCount: number
  scrollRef: RefObject<HTMLDivElement | null>
  slotRef: (id: string, el: HTMLElement | null) => void
  onSelect: (id: string) => void
}

export function HomeTagSpiralRail({
  tags,
  selectedId,
  memoCounts,
  noneCount,
  scrollRef,
  slotRef,
  onSelect,
}: Props) {
  const [scrollTop, setScrollTop] = useState(PAD_PX)
  const [view, setView] = useState({ width: 0, height: 0 })
  const primedRef = useRef(false)

  const items = useMemo<SpiralItem[]>(
    () => [
      { id: TAG_VIEW_NONE_ID, label: '태그 없음', count: noneCount },
      ...tags.map((t) => ({
        id: t.id,
        label: formatHashtagLabel(t.name),
        count: memoCounts.get(t.id) ?? 0,
      })),
    ],
    [tags, memoCounts, noneCount],
  )

  const count = items.length
  const endPad = Math.max(END_PAD, Math.round(view.height - PAD_PX))
  const spacerH = PAD_PX + count * ITEM_STRIDE + endPad

  useLayoutEffect(() => {
    primedRef.current = false
  }, [count])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || count === 0) return

    const sync = () => {
      setScrollTop(scroller.scrollTop)
      setView({
        width: scroller.clientWidth,
        height: scroller.clientHeight,
      })
    }

    if (!primedRef.current) {
      primedRef.current = true
      scroller.scrollTop = PAD_PX
      setScrollTop(PAD_PX)
    }

    sync()
    scroller.addEventListener('scroll', sync, { passive: true })
    const observer = new ResizeObserver(sync)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', sync)
      observer.disconnect()
    }
  }, [scrollRef, count])

  const innerH = Math.max(view.height * (1 - PAD_Y * 2), 160)
  const radius = Math.max(innerH * 0.78, 180)
  const cx = -radius + LEFT
  const cy = view.height * 0.5
  const ready = view.width > 0 && view.height > 0 && count > 0

  function scrollToCenter(id: string) {
    const scroller = scrollRef.current
    const index = items.findIndex((item) => item.id === id)
    if (!scroller || index < 0) return
    scroller.scrollTo({ top: index * ITEM_STRIDE, behavior: 'smooth' })
  }

  return (
    <div
      ref={scrollRef}
      className="tag-view-spiral"
      aria-label="태그 목록"
    >
      <div className="tag-view-spiral-frame">
        <div
          className="tag-view-spiral-stage"
          style={{ height: view.height || undefined }}
        >
          {ready
            ? items.map((item, index) => {
                const theta =
                  START_ANGLE +
                  index * ANGLE_STEP -
                  ((scrollTop - PAD_PX) / ITEM_STRIDE) * ANGLE_STEP
                if (Math.abs(theta) > VISIBLE_RAD) return null
                const x = cx + radius * Math.cos(theta)
                const y = cy + radius * Math.sin(theta)
                const rotate = (theta * 180) / Math.PI
                const isSelected = selectedId === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`tag-view-spiral-item${
                      isSelected ? ' tag-view-spiral-item--selected' : ''
                    }`}
                    style={{
                      transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`,
                    }}
                    aria-pressed={isSelected}
                    aria-label={item.label}
                    title={item.label}
                    onClick={() => {
                      scrollToCenter(item.id)
                      onSelect(item.id)
                    }}
                  >
                    <span className="tag-view-spiral-label">{item.label}</span>
                    <span className="tag-view-spiral-count">{item.count}</span>
                  </button>
                )
              })
            : null}
        </div>
      </div>
      <div className="tag-view-spiral-spacer" style={{ height: spacerH }}>
        <div style={{ height: PAD_PX }} />
        {items.map((item) => (
          <div
            key={item.id}
            ref={(el) => slotRef(item.id, el)}
            className="tag-view-spiral-hit"
            style={{ height: ITEM_STRIDE }}
          />
        ))}
        <div style={{ height: endPad }} />
      </div>
    </div>
  )
}
