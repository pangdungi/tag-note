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
  applyStructuredNotePaste,
  clipboardHtmlToPlainMemoText,
} from '../lib/pasteNoteFormat'
import {
  getMemoEditorSelectionOffsets,
  insertMemoEmojiInEditor,
  insertPlainTextInMemoEditor,
  isRangeInsideMemoEditor,
  memoBodyFromEditor,
  memoBodyToEditorHtml,
  normalizeLegacyUnicodeInString,
  normalizeMemoBodyStorage,
  normalizeQuickEmojisInEditor,
  serializeMemoEditor,
  serializedLengthOfMemoPrefix,
  setSelectionAtSerializedOffset,
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
  const savedRangeRef = useRef<Range | null>(null)
  const isComposingRef = useRef(false)
  const fallbackId = useId()
  const editorId = id ?? fallbackId

  const syncEditorFromValue = useCallback(
    (body: string, cursorOffset?: number) => {
      const el = editorRef.current
      if (!el) return
      const normalized = normalizeLegacyUnicodeInString(
        normalizeMemoBodyStorage(body),
      )
      lastSerializedRef.current = normalized
      el.innerHTML = normalized ? memoBodyToEditorHtml(normalized) : ''
      if (cursorOffset != null) {
        requestAnimationFrame(() => {
          setSelectionAtSerializedOffset(el, cursorOffset)
        })
      }
    },
    [],
  )

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
    const next = serializeMemoEditor(el)
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
    const el = editorRef.current
    if (el) {
      normalizeQuickEmojisInEditor(el)
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

    e.preventDefault()

    const pasted =
      e.clipboardData.getData('text/plain') ||
      clipboardHtmlToPlainMemoText(e.clipboardData.getData('text/html'))
    if (!pasted) return

    const insertRange = resolveEditorInsertRange(el)
    el.focus()
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(insertRange)
    }

    const currentBody = normalizeMemoBodyStorage(memoBodyFromEditor(el))
    const { start: selectionStart, end: selectionEnd } =
      getMemoEditorSelectionOffsets(el, insertRange)

    const structured = applyStructuredNotePaste(
      currentBody,
      source,
      pasted,
      selectionStart,
      selectionEnd,
    )
    if (structured.handled) {
      const tailLen = currentBody.length - selectionEnd
      const normalized = normalizeLegacyUnicodeInString(
        normalizeMemoBodyStorage(structured.body),
      )
      const cursorOffset = serializedLengthOfMemoPrefix(
        structured.body.slice(0, structured.body.length - tailLen),
      )
      syncEditorFromValue(normalized, cursorOffset)
      onChange(normalized)
      if (structured.source && onSourceChange) {
        onSourceChange(structured.source)
      }
      rememberEditorSelection()
      return
    }

    insertPlainTextInMemoEditor(el, insertRange, pasted)
    emitChange()
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
