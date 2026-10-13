type Props = {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

export function SourceLifeBookField({
  checked,
  disabled,
  onChange,
}: Props) {
  return (
    <div className="composer-field">
      <label className="source-life-book-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>인생책</span>
      </label>
      <p className="composer-field-hint">
        북스파인 위에 인생 표시가 붙습니다.
      </p>
    </div>
  )
}
