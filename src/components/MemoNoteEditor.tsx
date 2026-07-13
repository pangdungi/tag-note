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
  cleanPastedMemoText,
  clipboardHtmlToPlainMemoText,
  parseNotePasteWithTrailingUrl,
} from '../lib/pasteNoteFormat'
import {
  coalesceMemoEditorBody,
  getMemoEditorPasteOffsets,
  insertMemoEmojiInEditor,
  insertMemoPlainTextInEditor,
  insertPlainTextInMemoEditor,
  isRangeInsideMemoEditor,
  memoBodyToEditorHtml,
  normalizeLegacyUnicodeInString,
  normalizeMemoBodyStorage,
  normalizeQuickEmojisInEditor,
  serializeMemoEditor,
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

function collapseRangeToFocusEnd(range: Range): Range {
  const collapsed = range.cloneRange()
  if (!collapsed.collapsed) {
    collapsed.collapse(false)
  }
  return collapsed
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
  const savedSerializedOffsetRef = useRef(0)
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
    if (
      lastSerializedRef.current != null &&
      coalesceMemoEditorBody(value, lastSerializedRef.current) ===
        normalizeEditorBody(lastSerializedRef.current)
    ) {
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
    const rawNext = serializeMemoEditor(el)
    const next = normalizeEditorBody(
      coalesceMemoEditorBody(lastSerializedRef.current, rawNext),
    )
    const sel = window.getSelection()
    const range =
      sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    if (range && isRangeInsideMemoEditor(el, range)) {
      const caret = collapseRangeToFocusEnd(range)
      savedRangeRef.current = caret.cloneRange()
      savedSerializedOffsetRef.current = getMemoEditorPasteOffsets(
        el,
        caret,
      ).start
      const { start, end } = getMemoEditorPasteOffsets(el, range)
      lastSerializedRef.current = next
      recordHistory(next, start, end)
    } else {
      lastSerializedRef.current = next
      savedSerializedOffsetRef.current = next.length
      recordHistory(next, next.length, next.length)
    }
    onChange(next)
  }, [onChange, recordHistory])

  const rememberEditorSelection = useCallback(() => {
    const el = editorRef.current
    if (!el || disabled) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!isRangeInsideMemoEditor(el, range)) return
    const caret = collapseRangeToFocusEnd(range)
    savedRangeRef.current = caret.cloneRange()
    savedSerializedOffsetRef.current = getMemoEditorPasteOffsets(el, caret).start
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

    el.focus()
    const sel = window.getSelection()
    if (sel && savedRangeRef.current && isRangeInsideMemoEditor(el, savedRangeRef.current)) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current.cloneRange())
    }

    if (insertMemoEmojiInEditor(el, emojiId)) {
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
    const caret = collapseRangeToFocusEnd(insertRange)

    el.focus()
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(caret)
    }

    const parsedKyobo = parseNotePasteWithTrailingUrl(pasted)
    if (parsedKyobo) {
      insertPlainTextInMemoEditor(
        el,
        caret,
        cleanPastedMemoText(parsedKyobo.body, { trimWhole: false }),
      )
      emitChange()
      if (parsedKyobo.source && onSourceChange) {
        onSourceChange(parsedKyobo.source)
      }
      rememberEditorSelection()
      return
    }

    insertPlainTextInMemoEditor(el, caret, pasted)
    emitChange()
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
