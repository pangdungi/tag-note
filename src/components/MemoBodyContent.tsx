import { Fragment, useMemo } from 'react'
import { parseMemoBody, type MemoBodySegment } from '../lib/memoQuickEmojis'

type Props = {
  body: string
  className?: string
  emptyLabel?: string
  as?: 'span' | 'p' | 'div'
}

function renderTextWithLineBreaks(text: string, keyPrefix: string) {
  const lines = text.split('\n')
  if (lines.length === 1) {
    return <span key={keyPrefix}>{text}</span>
  }
  return lines.map((line, i) => (
    <Fragment key={`${keyPrefix}-line-${i}`}>
      {i > 0 ? <br /> : null}
      {line ? <span>{line}</span> : null}
    </Fragment>
  ))
}

function renderSegments(segments: MemoBodySegment[], keyPrefix: string) {
  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return renderTextWithLineBreaks(seg.value, `${keyPrefix}-t-${i}`)
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
