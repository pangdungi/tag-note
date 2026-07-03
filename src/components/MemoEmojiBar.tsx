import { MEMO_QUICK_EMOJIS } from '../lib/memoQuickEmojis'

type Props = {
  onInsert: (emojiId: string) => void
  onHighlight?: () => void
  disabled?: boolean
}

export function MemoEmojiBar({
  onInsert,
  onHighlight,
  disabled = false,
}: Props) {
  return (
    <div className="memo-emoji-bar" role="toolbar" aria-label="빠른 아이콘">
      {onHighlight ? (
        <button
          type="button"
          className="memo-emoji-bar-btn memo-emoji-bar-btn--highlight"
          aria-label="선택 영역 형광펜"
          title="선택 영역 형광펜"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onHighlight()}
        >
          <span className="memo-emoji-bar-highlight-icon" aria-hidden="true" />
        </button>
      ) : null}
      {MEMO_QUICK_EMOJIS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="memo-emoji-bar-btn"
          aria-label={`${item.label} 삽입`}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(item.id)}
        >
          <img
            className="memo-emoji-bar-icon"
            src={item.iconSrc}
            alt=""
            width={22}
            height={22}
            draggable={false}
          />
        </button>
      ))}
    </div>
  )
}
