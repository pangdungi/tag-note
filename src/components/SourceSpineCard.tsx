import type { CSSProperties } from 'react'
import type { SourceRow } from '../lib/notesApi'
import { hasSourceSpineImage } from '../lib/sourceSpineImage'
import { displaySourceTitle } from '../lib/sourceUtils'
import { formatSpineText } from '../lib/tagUtils'

type SourceSpineCardProps = {
  source: SourceRow
  selected: boolean
  expanded: boolean
  tagCount: number
  maxSpineHeight?: number
  onSelect: () => void
}

export function SourceSpineCard({
  source,
  selected,
  expanded,
  tagCount,
  maxSpineHeight,
  onSelect,
}: SourceSpineCardProps) {
  const label = displaySourceTitle(source.title)
  const useImage = hasSourceSpineImage(source)
  const spineHeight = source.spine_image_height ?? undefined
  const spineWidth = source.spine_image_width ?? undefined

  const cardStyle = (
    useImage
      ? {
          '--source-spine-natural-h': String(spineHeight ?? 1),
          '--source-spine-max-h': String(
            maxSpineHeight || spineHeight || 1,
          ),
        }
      : undefined
  ) as CSSProperties | undefined

  return (
    <div
      className={`parent-tag-card${
        selected ? ' parent-tag-card--selected' : ''
      }${expanded ? ' parent-tag-card--expanded' : ''}${
        useImage ? ' parent-tag-card--source-spine-image' : ''
      }`}
      style={cardStyle}
    >
      <button
        type="button"
        className={`parent-tag-card-body${
          useImage ? ' parent-tag-card-body--source-spine-image' : ''
        }`}
        aria-pressed={selected}
        aria-current={selected ? 'true' : undefined}
        aria-expanded={expanded}
        aria-label={label}
        title={label}
        onClick={onSelect}
      >
        {useImage ? (
          <img
            className="parent-tag-card-spine-image"
            src={source.spine_image_url!}
            alt=""
            width={spineWidth}
            height={spineHeight}
            draggable={false}
          />
        ) : (
          <span className="parent-tag-card-label">
            {formatSpineText(label)}
          </span>
        )}
      </button>
      {!useImage ? (
        <span className="parent-tag-spine-stat" aria-label={`태그 ${tagCount}개`}>
          #{tagCount}
        </span>
      ) : null}
    </div>
  )
}
