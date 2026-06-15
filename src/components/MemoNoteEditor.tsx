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
  reconcileMemoEditorShortcuts,
  serializedLengthOfMemoPrefix,
  serializedOffsetInEditor,
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
  const isComposingRef = useRef(false)
  const fallbackId = useId()
  const editorId = id ?? fallbackId

  const syncEditorFromValue = useCallback(
    (body: string, cursorOffset?: number) => {
      const el = editorRef.current
      if (!el) return
      const normalized = applyMemoTextShortcuts(body)
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
    const next = reconcileMemoEditorShortcuts(el)
    lastSerializedRef.current = next
    onChange(next)
  }, [onChange])

  const getEditorSelectionOffsets = useCallback((el: HTMLDivElement) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      const len = memoBodyFromEditor(el).length
      return { start: len, end: len }
    }
    const anchor = sel.anchorNode
    const focus = sel.focusNode
    if (
      !anchor ||
      !focus ||
      !el.contains(anchor) ||
      !el.contains(focus)
    ) {
      const len = memoBodyFromEditor(el).length
      return { start: len, end: len }
    }
    const anchorOffset = serializedOffsetInEditor(
      el,
      anchor,
      sel.anchorOffset,
    )
    const focusOffset = serializedOffsetInEditor(el, focus, sel.focusOffset)
    return {
      start: Math.min(anchorOffset, focusOffset),
      end: Math.max(anchorOffset, focusOffset),
    }
  }, [])

  const normalizePastePlainText = (raw: string) =>
    applyMemoTextShortcuts(
      cleanPastedMemoText(raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')),
    )

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

    e.preventDefault()

    const currentBody = normalizeMemoBodyStorage(memoBodyFromEditor(el))
    const { start: selectionStart, end: selectionEnd } =
      getEditorSelectionOffsets(el)

    const structured = applyStructuredNotePaste(
      currentBody,
      source,
      pasted,
      selectionStart,
      selectionEnd,
    )
    if (structured.handled) {
      const tailLen = currentBody.length - selectionEnd
      const normalized = applyMemoTextShortcuts(structured.body)
      const cursorOffset = serializedLengthOfMemoPrefix(
        structured.body.slice(0, structured.body.length - tailLen),
      )
      syncEditorFromValue(normalized, cursorOffset)
      onChange(normalized)
      if (structured.source && onSourceChange) {
        onSourceChange(structured.source)
      }
      return
    }

    const insertText = normalizePastePlainText(pasted)
    const pastePrefix = `${currentBody.slice(0, selectionStart)}${insertText}`
    const newBody = normalizeMemoBodyStorage(
      applyMemoTextShortcuts(
        `${pastePrefix}${currentBody.slice(selectionEnd)}`,
      ),
    )
    const normalized = applyMemoTextShortcuts(newBody)
    const cursorOffset = serializedLengthOfMemoPrefix(pastePrefix)
    syncEditorFromValue(normalized, cursorOffset)
    onChange(normalized)
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
