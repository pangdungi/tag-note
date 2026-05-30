import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
} from 'react'
import { applyStructuredNotePaste, cleanPastedMemoText } from '../lib/pasteNoteFormat'
import {
  applyMemoTextShortcuts,
  applyMemoTextShortcutsInEditor,
  insertMemoEmojiInEditor,
  memoBodyFromEditor,
  memoBodyToEditorHtml,
  normalizeMemoBodyStorage,
  serializedOffsetInEditor,
} from '../lib/memoQuickEmojis'
import { MemoEmojiBar } from './MemoEmojiBar'

type Props = {
  id?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  rows?: number
  disabled?: boolean
  source?: string
  onSourceChange?: (next: string) => void
  /** note.id 등 — 바뀔 때 에디터 내용을 value로 다시 채움 */
  resetKey?: string
  /** true면 min 높이에서 더 늘어나지 않고 내부 스크롤 */
  scrollClamp?: boolean
}

export function MemoNoteEditor({
  id,
  value,
  onChange,
  placeholder = '내용을 입력하세요',
  className = '',
  rows = 6,
  disabled = false,
  source = '',
  onSourceChange,
  resetKey,
  scrollClamp = false,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastSerializedRef = useRef<string | null>(null)
  const isComposingRef = useRef(false)
  const fallbackId = useId()
  const editorId = id ?? fallbackId

  const syncEditorFromValue = useCallback((body: string) => {
    const el = editorRef.current
    if (!el) return
    const normalized = applyMemoTextShortcuts(body)
    lastSerializedRef.current = normalized
    el.innerHTML = normalized ? memoBodyToEditorHtml(normalized) : ''
  }, [])

  useLayoutEffect(() => {
    if (lastSerializedRef.current === value) {
      return
    }
    syncEditorFromValue(value)
  }, [value, resetKey, syncEditorFromValue])

  useEffect(() => {
    if (lastSerializedRef.current !== null) {
      return
    }
    syncEditorFromValue(value)
  }, [value, syncEditorFromValue])

  const emitChange = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const next = applyMemoTextShortcuts(
      normalizeMemoBodyStorage(memoBodyFromEditor(el)),
    )
    lastSerializedRef.current = next
    onChange(next)
  }, [onChange])

  const handleInput = () => {
    if (isComposingRef.current) return
    const el = editorRef.current
    if (el) {
      applyMemoTextShortcutsInEditor(el)
    }
    emitChange()
  }

  const handleEmojiInsert = (emojiId: string) => {
    const el = editorRef.current
    if (!el || disabled) return
    if (insertMemoEmojiInEditor(el, emojiId)) {
      emitChange()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const el = editorRef.current
    if (!el) return

    const pasted = e.clipboardData.getData('text/plain')
    if (!pasted) return

    const currentBody = value
    let selectionStart = currentBody.length
    let selectionEnd = currentBody.length

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const anchor = sel.anchorNode
      const focus = sel.focusNode
      if (anchor && focus && el.contains(anchor) && el.contains(focus)) {
        const start = serializedOffsetInEditor(el, anchor, sel.anchorOffset)
        const end = serializedOffsetInEditor(el, focus, sel.focusOffset)
        selectionStart = Math.min(start, end)
        selectionEnd = Math.max(start, end)
      }
    }

    const result = applyStructuredNotePaste(
      currentBody,
      source,
      pasted,
      selectionStart,
      selectionEnd,
    )
    if (result.handled) {
      e.preventDefault()
      syncEditorFromValue(result.body)
      onChange(result.body)
      if (result.source && onSourceChange) {
        onSourceChange(result.source)
      }
      return
    }

    const cleaned = cleanPastedMemoText(pasted)
    if (cleaned !== pasted) {
      e.preventDefault()
      const before = currentBody.slice(0, selectionStart)
      const after = currentBody.slice(selectionEnd)
      const glueBefore =
        before.length > 0 && cleaned && !before.endsWith('\n') ? '\n\n' : ''
      const glueAfter =
        after.length > 0 && cleaned && !after.startsWith('\n') ? '\n\n' : ''
      const newBody = cleanPastedMemoText(
        `${before}${glueBefore}${cleaned}${glueAfter}${after}`,
      )
      syncEditorFromValue(newBody)
      onChange(newBody)
      return
    }

    window.setTimeout(() => emitChange(), 0)
  }

  const boxHeight = `${Math.max(rows, 3) * 1.5 + 1.5}rem`

  return (
    <>
      <div
        id={editorId}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={`composer-note memo-note-editor${className ? ` ${className}` : ''}${disabled ? ' memo-note-editor--disabled' : ''}${scrollClamp ? ' memo-note-editor--scroll-clamp' : ''}`}
        style={{
          minHeight: boxHeight,
          ...(scrollClamp ? { maxHeight: boxHeight } : {}),
        }}
        data-placeholder={placeholder}
        onInput={handleInput}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
          emitChange()
        }}
        onBlur={(e: FocusEvent<HTMLDivElement>) => {
          if (e.currentTarget.innerHTML === '<br>') {
            e.currentTarget.innerHTML = ''
          }
          emitChange()
        }}
        onPaste={handlePaste}
      />
      <MemoEmojiBar onInsert={handleEmojiInsert} disabled={disabled} />
    </>
  )
}
