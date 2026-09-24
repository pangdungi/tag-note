import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import type { SourceRow } from '../lib/notesApi'
import {
  hasStoredSourceSpine,
  isYes24MissingSpineImage,
  knownYes24SpinePresence,
  rememberYes24SpinePresence,
  resolveSourceSpineUrl,
} from '../lib/bookCatalogServer'
import {
  normalizeSourceBookColor,
  sourceBookColorStyle,
} from '../lib/sourceBookColor'
import {
  bookStandingHeightMm,
  displaySourceTitle,
  isSourceViewNoneId,
  textSpineFillRatio,
} from '../lib/sourceUtils'
import { formatSpineText } from '../lib/tagUtils'

type SourceSpineCardProps = {
  source: SourceRow
  selected: boolean
  expanded: boolean
  tagCount: number
  maxSpineHeight?: number
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void
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
  const goodsNo = source.yes24_goods_no?.trim() ?? ''
  const storedSpine = hasStoredSourceSpine(source)
  const cachedYes24 = goodsNo ? knownYes24SpinePresence(goodsNo) : undefined
  const spineUrl = resolveSourceSpineUrl(source)
  const [imageBroken, setImageBroken] = useState(cachedYes24 === false)
  const [remoteSpineReady, setRemoteSpineReady] = useState(
    storedSpine || cachedYes24 === true,
  )
  const useImage = Boolean(spineUrl) && !imageBroken && remoteSpineReady
  const bookColor = !useImage
    ? normalizeSourceBookColor(source.spine_color)
    : null
  const [loadedSpineSize, setLoadedSpineSize] = useState<{
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    setImageBroken(cachedYes24 === false)
    setLoadedSpineSize(null)
    setRemoteSpineReady(storedSpine || cachedYes24 === true)
  }, [spineUrl, storedSpine, cachedYes24])
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
  const textFill = useImage
    ? undefined
    : textSpineFillRatio(source, standingMm ? maxSpineHeight : null)
  const cardStyle: CSSProperties = useImage
    ? {
        ['--source-spine-natural-w' as string]: String(naturalW),
        ['--source-spine-natural-h' as string]: String(naturalH),
        ['--source-spine-max-h' as string]: String(
          maxSpineHeight || naturalH,
        ),
      }
    : {
        ['--source-spine-text-fill' as string]: String(textFill),
        ...(bookColor ? sourceBookColorStyle(bookColor) : null),
      }

  return (
    <div
      className={`parent-tag-card${
        selected ? ' parent-tag-card--selected' : ''
      }${expanded ? ' parent-tag-card--expanded' : ''}${
        useImage ? ' parent-tag-card--source-spine-image' : ''
      }${
        !useImage ? ' parent-tag-card--source-spine-text' : ''
      }${
        !useImage && bookColor ? ' parent-tag-card--book-color' : ''
      }${
        useImage && !useProportionalScale
          ? ' parent-tag-card--source-spine-remote'
          : ''
      }${
        isSourceViewNoneId(source.id) ? ' parent-tag-card--source-none' : ''
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
        onClick={(event) => onSelect(event)}
      >
        {spineUrl && !imageBroken ? (
          <img
            className={`parent-tag-card-spine-image${
              useImage ? '' : ' parent-tag-card-spine-image--probe'
            }`}
            src={spineUrl}
            alt=""
            width={useImage ? spineWidth : undefined}
            height={useImage ? spineHeight : undefined}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const img = e.currentTarget
              if (
                img.naturalWidth < 1 ||
                img.naturalHeight < 1 ||
                isYes24MissingSpineImage(img.naturalWidth, img.naturalHeight)
              ) {
                if (goodsNo && !storedSpine) {
                  rememberYes24SpinePresence(goodsNo, false)
                }
                setImageBroken(true)
                return
              }
              if (goodsNo && !storedSpine) {
                rememberYes24SpinePresence(goodsNo, true)
              }
              const size = {
                width: img.naturalWidth,
                height: img.naturalHeight,
              }
              setLoadedSpineSize(size)
              setRemoteSpineReady(true)
              onSpineSize?.(size)
            }}
            onError={() => {
              if (goodsNo && !storedSpine) {
                rememberYes24SpinePresence(goodsNo, false)
              }
              setImageBroken(true)
            }}
          />
        ) : null}
        {!useImage ? (
          <span className="parent-tag-card-label">
            {formatSpineText(label)}
          </span>
        ) : null}
      </button>
      {!useImage ? (
        <span className="parent-tag-spine-stat" aria-label={`태그 ${tagCount}개`}>
          {tagCount}
        </span>
      ) : null}
    </div>
  )
}
