import { MEMO_QUICK_EMOJIS } from '../lib/memoQuickEmojis'

type Props = {
  onInsert: (emojiId: string) => void
  disabled?: boolean
}

export function MemoEmojiBar({ onInsert, disabled = false }: Props) {
  return (
    <div className="memo-emoji-bar" role="toolbar" aria-label="빠른 아이콘">
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
