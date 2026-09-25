import { useRef, type MouseEvent, type PointerEvent } from 'react'

const MOVE_PX = 8

function selectionInside(node: EventTarget | null): boolean {
  if (!(node instanceof Element)) return false
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return false
  if (!sel.toString().replace(/\s+/g, '')) return false
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null
  if (!range) return false
  const root = range.commonAncestorContainer
  const el =
    root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement
  return Boolean(el && node.contains(el))
}

/** 한 번 탭하면 열고, 드래그·길게 눌러 텍스트를 고른 뒤에는 열지 않음 */
export function useOpenOnTap(onOpen: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const hadSelection = useRef(false)

  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      hadSelection.current = selectionInside(event.currentTarget)
      start.current = { x: event.clientX, y: event.clientY }
      dragged.current = false
    },
    onPointerMove: (event: PointerEvent) => {
      const from = start.current
      if (!from) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > MOVE_PX) {
        dragged.current = true
      }
    },
    onClick: (event: MouseEvent) => {
      if (event.detail > 1) return
      if (
        hadSelection.current ||
        dragged.current ||
        selectionInside(event.currentTarget)
      ) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      onOpen()
    },
  }
}
