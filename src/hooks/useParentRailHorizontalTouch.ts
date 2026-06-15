import { useEffect, type RefObject } from 'react'

/** 하위 태그 패널 위 가로 스와이프 → 레일 가로 스크롤 (세로는 목록 스크롤) */
export function useParentRailHorizontalTouch(
  sectionRef: RefObject<HTMLElement | null>,
  tracksRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const section = sectionRef.current
    const tracks = tracksRef.current
    if (!section || !tracks) return

    let startX = 0
    let startY = 0
    let startScrollLeft = 0
    let axis: 'none' | 'x' | 'y' = 'none'

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      startScrollLeft = section.scrollLeft
      axis = 'none'
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY

      if (axis === 'none') {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }

      if (axis === 'x') {
        e.preventDefault()
        section.scrollLeft = startScrollLeft - dx
      }
    }

    tracks.addEventListener('touchstart', onTouchStart, { passive: true })
    tracks.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      tracks.removeEventListener('touchstart', onTouchStart)
      tracks.removeEventListener('touchmove', onTouchMove)
    }
  }, [enabled, sectionRef, tracksRef])
}
