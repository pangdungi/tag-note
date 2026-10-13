import { useEffect, useState } from 'react'
import type { SourceRow } from '../lib/notesApi'
import { resolveSourceCoverUrl } from '../lib/bookCatalogServer'
import {
  resolveTextSpineColor,
  sourceBookColorStyle,
} from '../lib/sourceBookColor'
import {
  displaySourceTitle,
  normalizeSourceRating,
  normalizeSourceReview,
} from '../lib/sourceUtils'
import { SourceStars } from './SourceStars'

type Props = {
  source: SourceRow
}

export function LinksAllHoverCard({ source }: Props) {
  const title = displaySourceTitle(source.title)
  const coverUrl = resolveSourceCoverUrl(source)
  const [imageBroken, setImageBroken] = useState(false)
  const showCover = Boolean(coverUrl) && !imageBroken
  const bookColor = showCover ? null : resolveTextSpineColor(source)
  const rating = normalizeSourceRating(source.rating)
  const review = normalizeSourceReview(source.review)
  const meta = [source.author, source.publisher, source.published_year]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    setImageBroken(false)
  }, [coverUrl, source.id])

  return (
    <div className="links-all-hover-card" aria-live="polite">
      <div
        className={`links-all-hover-cover${
          !showCover && bookColor ? ' links-all-hover-cover--book-color' : ''
        }`}
        style={
          !showCover && bookColor ? sourceBookColorStyle(bookColor) : undefined
        }
      >
        {showCover && coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <span className="links-all-hover-cover-title">{title}</span>
        )}
      </div>
      <div className="links-all-hover-meta">
        <p className="links-all-hover-title">
          {title}
          {source.is_life_book ? (
            <span className="links-all-hover-life">인생책</span>
          ) : null}
        </p>
        {meta ? <p className="links-all-hover-sub">{meta}</p> : null}
        {source.category?.trim() ? (
          <p className="links-all-hover-sub">{source.category.trim()}</p>
        ) : null}
        {rating ? (
          <SourceStars value={rating} />
        ) : (
          <p className="links-all-hover-empty">별점 없음</p>
        )}
        {review ? (
          <p className="links-all-hover-review">{review}</p>
        ) : (
          <p className="links-all-hover-empty">도서평 없음</p>
        )}
      </div>
    </div>
  )
}
