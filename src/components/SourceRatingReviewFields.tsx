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
  return (
    <>
      <div className="composer-field">
        <span className="composer-label">별점</span>
        <SourceStars
          value={rating}
          interactive
          disabled={disabled}
          onChange={onRatingChange}
        />
        <p className="composer-field-hint">
          같은 별을 다시 누르면 지워집니다.
        </p>
      </div>
      <div className="composer-field">
        <label className="composer-label" htmlFor={reviewId}>
          도서평
        </label>
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
        <p className="composer-field-hint">
          {normalizeSourceReview(review).length}/{SOURCE_REVIEW_MAX}
        </p>
      </div>
    </>
  )
}
