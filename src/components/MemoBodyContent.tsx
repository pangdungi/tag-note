import { useMemo } from 'react'
import { parseMemoBody, type MemoBodySegment } from '../lib/memoQuickEmojis'

type Props = {
  body: string
  className?: string
  emptyLabel?: string
  as?: 'span' | 'p' | 'div'
}

function renderSegments(segments: MemoBodySegment[], keyPrefix: string) {
  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return <span key={`${keyPrefix}-t-${i}`}>{seg.value}</span>
    }
    return (
      <img
        key={`${keyPrefix}-e-${i}`}
        className="memo-body-inline-icon"
        src={seg.emoji.iconSrc}
        alt={seg.emoji.label}
        draggable={false}
      />
    )
  })
}

export function MemoBodyContent({
  body,
  className,
  emptyLabel = '내용 없음',
  as: Tag = 'span',
}: Props) {
  const trimmed = body.trim()
  const segments = useMemo(() => parseMemoBody(trimmed), [trimmed])

  if (!trimmed) {
    return <Tag className={className}>{emptyLabel}</Tag>
  }

  return (
    <Tag className={className}>{renderSegments(segments, 'body')}</Tag>
  )
}
