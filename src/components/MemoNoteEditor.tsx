import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
} from 'react'
import {
  clipboardHtmlToPlainMemoText,
  parseNotePasteWithTrailingUrl,
} from '../lib/pasteNoteFormat'
import {
  insertMemoEmojiInEditor,
  insertMemoPlainTextInEditor,
  insertPlainTextInMemoEditor,
  isRangeInsideMemoEditor,
  memoBodyToEditorHtml,
  normalizeMemoBodyStorage,
  readMemoEditorBody,
  toggleMemoHighlightInEditor,
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
  resetKey?: string
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
  source: _source = '',
  onSourceChange,
  resetKey,
  scrollClamp = false,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastSerializedRef = useRef<string | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const isComposingRef = useRef(false)
  const fallbackId = useId()
  const editorId = id ?? fallbackId
  const lastResetKeyRef = useRef(resetKey)

  const syncEditorFromValue = useCallback((body: string) => {
    const el = editorRef.current
    if (!el) return
    const normalized = normalizeMemoBodyStorage(body)
    lastSerializedRef.current = normalized
    el.innerHTML = normalized ? memoBodyToEditorHtml(normalized) : ''
  }, [])

  useLayoutEffect(() => {
    const normalizedValue = normalizeMemoBodyStorage(value)
    const resetKeyChanged = lastResetKeyRef.current !== resetKey
    lastResetKeyRef.current = resetKey

    if (lastSerializedRef.current === normalizedValue) {
      return
    }

    const el = editorRef.current
    const isEditing =
      el != null &&
      (el === document.activeElement || el.contains(document.activeElement))
    if (isEditing && !resetKeyChanged) {
      return
    }

    if (
      resetKeyChanged &&
      normalizedValue.length === 0 &&
      (lastSerializedRef.current?.length ?? 0) > 0
    ) {
      syncEditorFromValue(normalizedValue)
      savedRangeRef.current = null
      return
    }
    syncEditorFromValue(normalizedValue)
  }, [value, resetKey, syncEditorFromValue])

  useEffect(() => {
    if (lastSerializedRef.current !== null) return
    syncEditorFromValue(value)
  }, [value, syncEditorFromValue])

  const emitChange = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const next = readMemoEditorBody(el)
    lastSerializedRef.current = next
    onChange(next)
  }, [onChange])

  const rememberEditorSelection = useCallback(() => {
    const el = editorRef.current
    if (!el || disabled) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!isRangeInsideMemoEditor(el, range)) return
    savedRangeRef.current = range.cloneRange()
  }, [disabled])

  const resolveEditorInsertRange = useCallback((el: HTMLDivElement): Range => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const live = sel.getRangeAt(0)
      if (isRangeInsideMemoEditor(el, live)) {
        return live.cloneRange()
      }
    }

    const saved = savedRangeRef.current
    if (saved && isRangeInsideMemoEditor(el, saved)) {
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(saved)
      }
      return saved.cloneRange()
    }

    el.focus()
    const end = document.createRange()
    end.selectNodeContents(el)
    end.collapse(false)
    return end
  }, [])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    const onSelectionChange = () => {
      if (el !== document.activeElement && !el.contains(document.activeElement)) {
        return
      }
      rememberEditorSelection()
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [rememberEditorSelection, resetKey])

  const handleInput = () => {
    if (isComposingRef.current) return
    emitChange()
  }

  const handleEmojiInsert = (emojiId: string) => {
    const el = editorRef.current
    if (!el || disabled) return

    el.focus()
    const sel = window.getSelection()
    if (sel && savedRangeRef.current && isRangeInsideMemoEditor(el, savedRangeRef.current)) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current.cloneRange())
    }

    if (insertMemoEmojiInEditor(el, emojiId)) {
      emitChange()
      rememberEditorSelection()
    }
  }

  const handleCircledNumberInsert = (char: string) => {
    const el = editorRef.current
    if (!el || disabled) return
    if (insertMemoPlainTextInEditor(el, char)) {
      emitChange()
      rememberEditorSelection()
    }
  }

  const handleHighlight = () => {
    const el = editorRef.current
    if (!el || disabled) return
    if (toggleMemoHighlightInEditor(el)) {
      emitChange()
      rememberEditorSelection()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const el = editorRef.current
    if (!el) return

    e.preventDefault()

    const pasted =
      e.clipboardData.getData('text/plain') ||
      clipboardHtmlToPlainMemoText(e.clipboardData.getData('text/html'))
    if (!pasted) return

    const range = resolveEditorInsertRange(el)
    const parsedKyobo = parseNotePasteWithTrailingUrl(pasted)
    const insertText = parsedKyobo?.body ?? pasted

    insertPlainTextInMemoEditor(el, range, insertText)
    emitChange()

    if (parsedKyobo?.source && onSourceChange) {
      onSourceChange(parsedKyobo.source)
    }
    rememberEditorSelection()
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
        onMouseUp={rememberEditorSelection}
        onKeyUp={rememberEditorSelection}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
          emitChange()
        }}
        onBlur={(e: FocusEvent<HTMLDivElement>) => {
          const related = e.relatedTarget
          if (
            related instanceof HTMLElement &&
            related.closest('.memo-emoji-bar-wrap')
          ) {
            return
          }
          emitChange()
        }}
        onPaste={handlePaste}
      />
      <MemoEmojiBar
        onInsert={handleEmojiInsert}
        onInsertCircledNumber={handleCircledNumberInsert}
        onHighlight={handleHighlight}
        disabled={disabled}
      />
    </>
  )
}
