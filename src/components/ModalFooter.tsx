import type { ReactNode } from 'react'

type ModalFooterProps = {
  children: ReactNode
  className?: string
  /** between: 양쪽 정렬(기본) · end: 오른쪽 · start: 왼쪽 */
  align?: 'between' | 'end' | 'start'
}

export function ModalFooter({
  children,
  className = '',
  align = 'between',
}: ModalFooterProps) {
  return (
    <div
      className={`tag-manage-footer tag-manage-footer--${align}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </div>
  )
}
