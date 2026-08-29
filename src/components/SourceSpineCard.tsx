import { useEffect, useState, type CSSProperties } from 'react'
import type { SourceRow } from '../lib/notesApi'
import { resolveSourceSpineUrl } from '../lib/bookCatalogServer'
import { bookStandingHeightMm, displaySourceTitle } from '../lib/sourceUtils'
import { formatSpineText } from '../lib/tagUtils'

type SourceSpineCardProps = {
  source: SourceRow
  selected: boolean
  expanded: boolean
  tagCount: number
  maxSpineHeight?: number
  onSelect: () => void
  onSpineSize?: (size: { width: number; height: number }) => void
}

export function SourceSpineCard({
  source,
  selected,
  expanded,
  tagCount,
  maxSpineHeight,
  onSelect,
  onSpineSize,
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
    loadedSpineSize?.height && loadedSpineSize.height > 0
      ? loadedSpineSize.height
      : source.spine_image_height && source.spine_image_height > 0
        ? source.spine_image_height
        : undefined
  const spineWidth =
    loadedSpineSize?.width && loadedSpineSize.width > 0
      ? loadedSpineSize.width
      : source.spine_image_width && source.spine_image_width > 0
        ? source.spine_image_width
        : undefined
  const useStoredSpineScale = Boolean(
    source.spine_image_height && source.spine_image_height > 0,
  )
  const useLoadedSpineScale = Boolean(
    loadedSpineSize &&
      loadedSpineSize.height > 0 &&
      (maxSpineHeight || loadedSpineSize.height),
  )
  const useProportionalScale = useStoredSpineScale || useLoadedSpineScale

  const standingMm = bookStandingHeightMm(source)
  const naturalH =
    standingMm ?? spineHeight ?? loadedSpineSize?.height ?? 560
  const naturalW = spineWidth ?? loadedSpineSize?.width ?? 80
  const cardStyle: CSSProperties = useImage
    ? {
        ['--source-spine-natural-w' as string]: String(naturalW),
        ['--source-spine-natural-h' as string]: String(naturalH),
        ['--source-spine-max-h' as string]: String(
          maxSpineHeight || naturalH,
        ),
      }
    : {}

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
              const size = {
                width: img.naturalWidth,
                height: img.naturalHeight,
              }
              setLoadedSpineSize(size)
              onSpineSize?.(size)
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
