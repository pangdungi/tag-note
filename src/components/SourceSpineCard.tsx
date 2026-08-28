import { useEffect, useState, type CSSProperties } from 'react'
import type { SourceRow } from '../lib/notesApi'
import { resolveSourceSpineUrl } from '../lib/bookCatalogServer'
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
  const spineUrl = resolveSourceSpineUrl(source)
  const [imageBroken, setImageBroken] = useState(false)
  const useImage = Boolean(spineUrl) && !imageBroken
  const [loadedSpineSize, setLoadedSpineSize] = useState<{
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    setImageBroken(false)
    setLoadedSpineSize(null)
  }, [spineUrl])
  const spineHeight =
    source.spine_image_height && source.spine_image_height > 0
      ? source.spine_image_height
      : loadedSpineSize?.height
  const spineWidth =
    source.spine_image_width && source.spine_image_width > 0
      ? source.spine_image_width
      : loadedSpineSize?.width
  const useStoredSpineScale = Boolean(
    source.spine_image_height && source.spine_image_height > 0,
  )
  const useLoadedSpineScale = Boolean(
    loadedSpineSize &&
      loadedSpineSize.height > 0 &&
      (maxSpineHeight || loadedSpineSize.height),
  )
  const useProportionalScale = useStoredSpineScale || useLoadedSpineScale

  const cardStyle: CSSProperties = useImage
    ? useProportionalScale
      ? {
          ['--source-spine-natural-h' as string]: String(
            spineHeight ?? loadedSpineSize?.height ?? 1,
          ),
          ['--source-spine-max-h' as string]: String(
            maxSpineHeight || loadedSpineSize?.height || spineHeight || 1,
          ),
        }
      : {}
    : {
        ['--source-spine-text-fill' as string]: String(
          Math.min(0.94, Math.max(0.5, 0.46 + label.length * 0.014)),
        ),
      }

  return (
    <div
      className={`parent-tag-card${
        selected ? ' parent-tag-card--selected' : ''
      }${expanded ? ' parent-tag-card--expanded' : ''}${
        useImage ? ' parent-tag-card--source-spine-image' : ''
      }${
        useImage && !useProportionalScale
          ? ' parent-tag-card--source-spine-remote'
          : ''
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
        {useImage && spineUrl ? (
          <img
            className="parent-tag-card-spine-image"
            src={spineUrl}
            alt=""
            width={spineWidth}
            height={spineHeight}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth < 1 || img.naturalHeight < 1) return
              setLoadedSpineSize({
                width: img.naturalWidth,
                height: img.naturalHeight,
              })
            }}
            onError={() => setImageBroken(true)}
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
