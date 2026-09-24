import { useId } from 'react'
import {
  DEFAULT_SOURCE_BOOK_COLOR,
  SOURCE_BOOK_COLOR_SWATCHES,
  normalizeSourceBookColor,
} from '../lib/sourceBookColor'

type Props = {
  value: string | null
  fallback?: string | null
  hint?: string
  disabled?: boolean
  onChange: (next: string | null) => void
}

export function SourceBookColorField({
  value,
  fallback = null,
  hint,
  disabled = false,
  onChange,
}: Props) {
  const pickerId = useId()
  const selected =
    normalizeSourceBookColor(value) ??
    normalizeSourceBookColor(fallback) ??
    DEFAULT_SOURCE_BOOK_COLOR
  const custom = !SOURCE_BOOK_COLOR_SWATCHES.includes(
    selected as (typeof SOURCE_BOOK_COLOR_SWATCHES)[number],
  )

  return (
    <div className="composer-field source-book-color-field">
      <div className="composer-label-row">
        <label className="composer-label" htmlFor={pickerId}>
          책 색
        </label>
        {value ? (
          <button
            type="button"
            className="source-spine-edit-remove"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            기본으로
          </button>
        ) : null}
      </div>
      {hint ? <p className="composer-field-hint">{hint}</p> : null}
      <div className="source-book-color-swatches" role="list">
        {SOURCE_BOOK_COLOR_SWATCHES.map((hex) => {
          const active = selected === hex
          return (
            <button
              key={hex}
              type="button"
              role="listitem"
              className={`source-book-color-swatch${
                active ? ' source-book-color-swatch--selected' : ''
              }`}
              style={{ background: hex }}
              aria-label={hex}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(hex)}
            />
          )
        })}
        <label
          className={`source-book-color-custom${
            custom ? ' source-book-color-custom--selected' : ''
          }`}
        >
          <input
            id={pickerId}
            type="color"
            value={selected}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-label="직접 고르기"
          />
        </label>
      </div>
    </div>
  )
}
