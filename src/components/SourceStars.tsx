import { normalizeSourceRating } from '../lib/sourceUtils'

type SourceStarsProps = {
  value: number | null | undefined
  interactive?: boolean
  disabled?: boolean
  onChange?: (next: number | null) => void
}

export function SourceStars({
  value,
  interactive = false,
  disabled = false,
  onChange,
}: SourceStarsProps) {
  const rating = normalizeSourceRating(value)

  return (
    <div
      className={`source-stars${interactive ? ' source-stars--interactive' : ''}`}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={rating ? `별점 ${rating}점` : '별점 없음'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = rating != null && n <= rating
        if (!interactive) {
          return (
            <span
              key={n}
              className={`source-star${on ? ' source-star--on' : ''}`}
              aria-hidden
            >
              ★
            </span>
          )
        }
        return (
          <button
            key={n}
            type="button"
            className={`source-star source-star-btn${on ? ' source-star--on' : ''}`}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}점`}
            disabled={disabled}
            onClick={() => onChange?.(rating === n ? null : n)}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}
