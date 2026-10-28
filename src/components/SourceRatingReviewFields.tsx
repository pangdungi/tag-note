import { useId } from 'react'
import {
  SOURCE_REVIEW_MAX,
  normalizeSourceReview,
} from '../lib/sourceUtils'
import { SourceStars } from './SourceStars'

type Props = {
  rating: number | null
  review: string
  disabled?: boolean
  onRatingChange: (next: number | null) => void
  onReviewChange: (next: string) => void
}

export function SourceRatingReviewFields({
  rating,
  review,
  disabled,
  onRatingChange,
  onReviewChange,
}: Props) {
  const reviewId = useId()
  const reviewLen = normalizeSourceReview(review).length
  return (
    <>
      <div className="composer-field source-rating-field">
        <span className="composer-label">별점</span>
        <SourceStars
          value={rating}
          interactive
          disabled={disabled}
          onChange={onRatingChange}
        />
      </div>
      <div className="composer-field source-review-field">
        <div className="composer-label-row">
          <label className="composer-label" htmlFor={reviewId}>
            도서평
          </label>
          <span className="composer-field-meta" aria-live="polite">
            {reviewLen}/{SOURCE_REVIEW_MAX}
          </span>
        </div>
        <textarea
          id={reviewId}
          className="composer-source source-review-input"
          value={review}
          disabled={disabled}
          maxLength={SOURCE_REVIEW_MAX}
          rows={3}
          placeholder="이 책에 대한 짧은 평가"
          onChange={(e) => onReviewChange(e.target.value)}
        />
      </div>
    </>
  )
}
