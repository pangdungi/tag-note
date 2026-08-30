import { useEffect, useState } from 'react'
import type { SourceRow } from '../lib/notesApi'
import { resolveSourceCoverUrl } from '../lib/bookCatalogServer'
import { bookStandingHeightMm, displaySourceTitle } from '../lib/sourceUtils'

type SourceCoverPreviewProps = {
  source: SourceRow
  spineHeight: number
  opening?: boolean
  onOpen: () => void
  onEdit?: () => void
}

const COVER_RATIO = 0.68

function coverRatio(source: SourceRow, imageRatio: number | null) {
  if (imageRatio && imageRatio > 0) return imageRatio
  const standingMm = bookStandingHeightMm(source)
  const faceMm = source.book_width_mm && source.book_width_mm > 0
    ? source.book_width_mm
    : null
  if (standingMm && faceMm && standingMm > 0) return faceMm / standingMm
  return COVER_RATIO
}

export function SourceCoverPreview({
  source,
  spineHeight,
  opening = false,
  onOpen,
  onEdit,
}: SourceCoverPreviewProps) {
  const label = displaySourceTitle(source.title)
  const coverUrl = resolveSourceCoverUrl(source)
  const [imageBroken, setImageBroken] = useState(false)
  const [imageRatio, setImageRatio] = useState<number | null>(null)
  const showCover = Boolean(coverUrl) && !imageBroken
  const height = Math.max(48, spineHeight || 160)
  const width = Math.max(24, height * coverRatio(source, imageRatio))

  useEffect(() => {
    setImageBroken(false)
    setImageRatio(null)
  }, [coverUrl])

  return (
    <div className="links-shelf-cover-block">
      <div
        className={`links-shelf-cover-hinge${
          opening ? ' links-shelf-cover-hinge--opening' : ''
        }`}
        style={{ width, height }}
      >
        <span className="links-shelf-cover-inside" aria-hidden="true" />
        <button
          type="button"
          className="links-shelf-cover"
          aria-label={`${label} 메모 보기`}
          disabled={opening}
          onClick={onOpen}
        >
          {showCover && coverUrl ? (
            <img
              className="links-shelf-cover-image"
              src={coverUrl}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={(event) => {
                const img = event.currentTarget
                if (img.naturalWidth < 1 || img.naturalHeight < 1) return
                setImageRatio(img.naturalWidth / img.naturalHeight)
              }}
              onError={() => setImageBroken(true)}
            />
          ) : (
            <span className="links-shelf-cover-blank">
              <span className="links-shelf-cover-title">{label}</span>
            </span>
          )}
        </button>
      </div>
      {onEdit && !opening ? (
        <button
          type="button"
          className="links-shelf-cover-edit"
          onClick={(event) => {
            event.stopPropagation()
            onEdit()
          }}
        >
          책 수정
        </button>
      ) : null}
    </div>
  )
}
