import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import {
  applyStructuredNotePaste,
  cleanPastedMemoText,
  clipboardHtmlToPlainMemoText,
} from '../lib/pasteNoteFormat'
import {
  getMemoEditorSelectionOffsets,
  getMemoEditorPasteOffsets,
  insertMemoEmojiInEditor,
  insertMemoPlainTextInEditor,
  isRangeInsideMemoEditor,
  memoBodyFromEditor,
  memoBodyToEditorHtml,
  normalizeLegacyUnicodeInString,
  normalizeMemoBodyStorage,
  normalizeQuickEmojisInEditor,
  serializeMemoEditor,
  serializedLengthOfMemoPrefix,
  setSelectionAtSerializedOffset,
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
  /** note.id 등 — 바뀔 때 에디터 내용을 value로 다시 채움 */
  resetKey?: string
  /** true면 min 높이에서 더 늘어나지 않고 내부 스크롤 */
  scrollClamp?: boolean
}

type MemoEditorHistoryEntry = {
  body: string
  start: number
  end: number
}

const MEMO_EDITOR_HISTORY_MAX = 100

function normalizeEditorBody(body: string): string {
  return normalizeLegacyUnicodeInString(normalizeMemoBodyStorage(body))
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
  const isHistoryActionRef = useRef(false)
  const historyRef = useRef<MemoEditorHistoryEntry[]>([])
  const historyIndexRef = useRef(0)
  const fallbackId = useId()
  const editorId = id ?? fallbackId

  const resetHistory = useCallback((body: string) => {
    const normalized = normalizeEditorBody(body)
    historyRef.current = [
      {
        body: normalized,
        start: normalized.length,
        end: normalized.length,
      },
    ]
    historyIndexRef.current = 0
  }, [])

  const recordHistory = useCallback(
    (next: string, start: number, end: number) => {
      if (isHistoryActionRef.current || isComposingRef.current) return
      const idx = historyIndexRef.current
      const stack = historyRef.current
      const top = stack[idx]
      if (top && top.body === next && top.start === start && top.end === end) {
        return
      }
      const trimmed = stack.slice(0, idx + 1)
      trimmed.push({ body: next, start, end })
      while (trimmed.length > MEMO_EDITOR_HISTORY_MAX) {
        trimmed.shift()
      }
      historyRef.current = trimmed
      historyIndexRef.current = trimmed.length - 1
    },
    [],
  )

  const syncEditorFromValue = useCallback(
    (body: string, cursorOffset?: number) => {
      const el = editorRef.current
      if (!el) return
      const normalized = normalizeEditorBody(body)
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

  const applyHistoryEntry = useCallback(
    (entry: MemoEditorHistoryEntry) => {
      isHistoryActionRef.current = true
      syncEditorFromValue(entry.body, entry.end)
      lastSerializedRef.current = entry.body
      onChange(entry.body)
      requestAnimationFrame(() => {
        isHistoryActionRef.current = false
      })
    },
    [onChange, syncEditorFromValue],
  )

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    applyHistoryEntry(historyRef.current[historyIndexRef.current])
  }, [applyHistoryEntry])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    applyHistoryEntry(historyRef.current[historyIndexRef.current])
  }, [applyHistoryEntry])

  useLayoutEffect(() => {
    if (lastSerializedRef.current === value) {
      return
    }
    syncEditorFromValue(value)
    resetHistory(value)
  }, [value, resetKey, syncEditorFromValue, resetHistory])

  useEffect(() => {
    if (lastSerializedRef.current !== null) {
      return
    }
    syncEditorFromValue(value)
    resetHistory(value)
  }, [value, syncEditorFromValue, resetHistory])

  const emitChange = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const next = serializeMemoEditor(el)
    const { start, end } = getMemoEditorSelectionOffsets(el)
    lastSerializedRef.current = next
    recordHistory(next, start, end)
    onChange(next)
  }, [onChange, recordHistory])

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
      rememberEditorSelection()
      emitChange()
    }
  }

  const handleCircledNumberInsert = (char: string) => {
    const el = editorRef.current
    if (!el || disabled) return
    if (insertMemoPlainTextInEditor(el, char)) {
      emitChange()
    }
  }

  const handleHighlight = () => {
    const el = editorRef.current
    if (!el || disabled) return
    if (toggleMemoHighlightInEditor(el)) {
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
    const { start: selectionStart, end: selectionEnd } =
      getMemoEditorPasteOffsets(el, insertRange)

    el.focus()
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      const caret = insertRange.cloneRange()
      if (!caret.collapsed) {
        caret.collapse(false)
      }
      sel.addRange(caret)
    }

    const currentBody = normalizeEditorBody(
      normalizeMemoBodyStorage(memoBodyFromEditor(el)),
    )

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
      lastSerializedRef.current = normalized
      recordHistory(normalized, cursorOffset, cursorOffset)
      onChange(normalized)
      if (structured.source && onSourceChange) {
        onSourceChange(structured.source)
      }
      rememberEditorSelection()
      return
    }

    const pastedClean = cleanPastedMemoText(
      pasted.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      { trimWhole: false },
    )
    const before = currentBody.slice(0, selectionStart)
    const after = currentBody.slice(selectionEnd)
    const merged = `${before}${pastedClean}${after}`
    const normalized = normalizeEditorBody(merged)
    const cursorOffset = serializedLengthOfMemoPrefix(`${before}${pastedClean}`)
    syncEditorFromValue(normalized, cursorOffset)
    lastSerializedRef.current = normalized
    recordHistory(normalized, cursorOffset, cursorOffset)
    onChange(normalized)
    rememberEditorSelection()
  }

  const boxHeight = `${Math.max(rows, 3) * 1.5 + 1.5}rem`

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || isComposingRef.current) return
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
      return
    }
    if (key === 'z' && e.shiftKey) {
      e.preventDefault()
      redo()
      return
    }
    if (key === 'y') {
      e.preventDefault()
      redo()
    }
  }

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
        onKeyDown={handleKeyDown}
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
      <MemoEmojiBar
        onInsert={handleEmojiInsert}
        onInsertCircledNumber={handleCircledNumberInsert}
        onHighlight={handleHighlight}
        disabled={disabled}
      />
    </>
  )
}
