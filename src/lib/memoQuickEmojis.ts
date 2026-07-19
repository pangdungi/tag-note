import arrowrightIcon from '../assets/memo-emojis/arrowright.svg'
import checkIcon from '../assets/memo-emojis/check.svg'
import faceIcon from '../assets/memo-emojis/face.svg'
import musicIcon from '../assets/memo-emojis/music.svg'
import noIcon from '../assets/memo-emojis/no.svg'
import okIcon from '../assets/memo-emojis/ok.svg'
import startIcon from '../assets/memo-emojis/start.svg'
import thinkingIcon from '../assets/memo-emojis/thinking.svg'
import uncheckIcon from '../assets/memo-emojis/uncheck.svg'

export type MemoQuickEmoji = {
  id: string
  label: string
  iconSrc: string
  /** 예전에 유니코드로 저장된 메모 — 읽기 전용 표시용 */
  legacyUnicode?: string
}

export const MEMO_QUICK_EMOJIS: MemoQuickEmoji[] = [
  { id: 'start', label: '별', iconSrc: startIcon, legacyUnicode: '💡' },
  { id: 'arrowright', label: '가리키기', iconSrc: arrowrightIcon, legacyUnicode: '👉🏻' },
  { id: 'music', label: '음악', iconSrc: musicIcon, legacyUnicode: '🎧' },
  { id: 'uncheck', label: '빈 칸', iconSrc: uncheckIcon, legacyUnicode: '◽️' },
  { id: 'check', label: '체크', iconSrc: checkIcon, legacyUnicode: '✔️' },
  { id: 'ok', label: '동그라미', iconSrc: okIcon, legacyUnicode: '⭕️' },
  { id: 'no', label: '거절', iconSrc: noIcon, legacyUnicode: '❌' },
  { id: 'thinking', label: '생각', iconSrc: thinkingIcon, legacyUnicode: '💭' },
  { id: 'face', label: '얼굴', iconSrc: faceIcon },
]

export const MEMO_CIRCLED_NUMBERS = [
  { char: '①', label: '1' },
  { char: '②', label: '2' },
  { char: '③', label: '3' },
  { char: '④', label: '4' },
  { char: '⑤', label: '5' },
  { char: '⑥', label: '6' },
  { char: '⑦', label: '7' },
  { char: '⑧', label: '8' },
  { char: '⑨', label: '9' },
] as const

const MEMO_EMOJI_LEGACY_IDS: Record<string, string> = {
  lightbulb: 'start',
  pencil: 'thinking',
  book: 'face',
}

const MEMO_EMOJI_BY_ID = new Map(MEMO_QUICK_EMOJIS.map((e) => [e.id, e]))

const MEMO_EMOJI_TOKEN_IDS = [
  ...MEMO_QUICK_EMOJIS.map((e) => e.id),
  ...Object.keys(MEMO_EMOJI_LEGACY_IDS),
].join('|')

export const MEMO_EMOJI_TOKEN_RE = new RegExp(
  `:m\\/(${MEMO_EMOJI_TOKEN_IDS}):`,
  'g',
)

/** 형광펜 — :m/hi:내용:/m/hi: */
export const MEMO_HIGHLIGHT_OPEN = ':m/hi:'
export const MEMO_HIGHLIGHT_CLOSE = ':/m/hi:'
const MEMO_HIGHLIGHT_PARSE_MAX_DEPTH = 24

export function memoEmojiToken(id: string): string {
  return `:m/${id}:`
}

export function memoEmojiById(id: string): MemoQuickEmoji | undefined {
  const resolved = MEMO_EMOJI_LEGACY_IDS[id] ?? id
  return MEMO_EMOJI_BY_ID.get(resolved)
}

/** DB에 남은 레거시 enter 토큰만 제거 */
export function normalizeMemoBodyStorage(body: string): string {
  return body.replace(/:m\/enter:/g, '')
}

export type MemoBodySegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; id: string; emoji: MemoQuickEmoji }
  | { type: 'highlight'; children: MemoBodySegment[] }

function parseMemoBodyEmojiOnly(text: string): MemoBodySegment[] {
  if (!text) return []

  type Mark = { index: number; length: number; id: string }
  const marks: Mark[] = []

  MEMO_EMOJI_TOKEN_RE.lastIndex = 0
  let tokenMatch: RegExpExecArray | null
  while ((tokenMatch = MEMO_EMOJI_TOKEN_RE.exec(text)) !== null) {
    marks.push({
      index: tokenMatch.index,
      length: tokenMatch[0].length,
      id: tokenMatch[1],
    })
  }

  for (const emoji of MEMO_QUICK_EMOJIS) {
    if (!emoji.legacyUnicode) continue
    let from = 0
    while (from < text.length) {
      const idx = text.indexOf(emoji.legacyUnicode, from)
      if (idx === -1) break
      marks.push({ index: idx, length: emoji.legacyUnicode.length, id: emoji.id })
      from = idx + emoji.legacyUnicode.length
    }
  }

  marks.sort((a, b) => a.index - b.index || b.length - a.length)

  const picked: Mark[] = []
  let cursor = 0
  for (const mark of marks) {
    if (mark.index < cursor) continue
    picked.push(mark)
    cursor = mark.index + mark.length
  }

  const segments: MemoBodySegment[] = []
  let pos = 0
  for (const mark of picked) {
    if (mark.index > pos) {
      segments.push({ type: 'text', value: text.slice(pos, mark.index) })
    }
    const emoji = memoEmojiById(mark.id)
    if (emoji) {
      segments.push({ type: 'emoji', id: emoji.id, emoji })
    } else {
      segments.push({
        type: 'text',
        value: text.slice(mark.index, mark.index + mark.length),
      })
    }
    pos = mark.index + mark.length
  }
  if (pos < text.length) {
    segments.push({ type: 'text', value: text.slice(pos) })
  }
  return segments
}

function parseMemoBodySegments(text: string, depth = 0): MemoBodySegment[] {
  if (!text) return []
  if (depth > MEMO_HIGHLIGHT_PARSE_MAX_DEPTH) {
    return parseMemoBodyEmojiOnly(text)
  }

  const segments: MemoBodySegment[] = []
  let pos = 0

  while (pos < text.length) {
    const openIdx = text.indexOf(MEMO_HIGHLIGHT_OPEN, pos)
    if (openIdx === -1) {
      segments.push(...parseMemoBodyEmojiOnly(text.slice(pos)))
      break
    }

    if (openIdx > pos) {
      segments.push(...parseMemoBodyEmojiOnly(text.slice(pos, openIdx)))
    }

    const afterOpen = openIdx + MEMO_HIGHLIGHT_OPEN.length
    const closeIdx = text.indexOf(MEMO_HIGHLIGHT_CLOSE, afterOpen)
    if (closeIdx === -1) {
      segments.push(...parseMemoBodyEmojiOnly(text.slice(openIdx)))
      break
    }

    const inner = text.slice(afterOpen, closeIdx)
    segments.push({
      type: 'highlight',
      children: parseMemoBodySegments(inner, depth + 1),
    })
    pos = closeIdx + MEMO_HIGHLIGHT_CLOSE.length
  }

  return segments
}

/** 메모 본문 파싱 — 텍스트·퀵 이모티콘·형광펜 */
export function parseMemoBody(body: string): MemoBodySegment[] {
  const normalized = normalizeMemoBodyStorage(body)
  if (!normalized) return []
  return parseMemoBodySegments(normalized)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function segmentsToEditorHtml(segments: MemoBodySegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'text') {
        return escapeHtml(seg.value).replace(/\n/g, '<br>')
      }
      if (seg.type === 'highlight') {
        return `<mark class="memo-body-highlight" data-memo-highlight="1">${segmentsToEditorHtml(
          seg.children,
        )}</mark>`
      }
      const { emoji } = seg
      return `<img class="memo-body-inline-icon" data-memo-emoji="${emoji.id}" src="${emoji.iconSrc}" alt="${emoji.label}" draggable="false" contenteditable="false" />`
    })
    .join('')
}

/** 저장 문자열 → 에디터 HTML (열 때 1회) */
export function memoBodyToEditorHtml(body: string): string {
  return segmentsToEditorHtml(parseMemoBody(body))
}

function serializeEditorInlineNodes(nodes: NodeListOf<ChildNode> | ChildNode[]): string {
  let out = ''

  function walk(n: Node): void {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent ?? ''
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement

    if (el.tagName === 'BR') {
      out += '\n'
      return
    }
    if (el.tagName === 'IMG' && el.dataset.memoEmoji) {
      out += memoEmojiToken(el.dataset.memoEmoji)
      return
    }
    if (
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      out += MEMO_HIGHLIGHT_OPEN
      for (const child of el.childNodes) walk(child)
      out += MEMO_HIGHLIGHT_CLOSE
      return
    }

    for (const child of el.childNodes) walk(child)
  }

  for (const node of nodes) walk(node)
  return out
}

function cloneForPlainTextRead(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement
  for (const img of clone.querySelectorAll('img[data-memo-emoji]')) {
    const id = (img as HTMLImageElement).dataset.memoEmoji
    if (id) {
      img.replaceWith(document.createTextNode(memoEmojiToken(id)))
    }
  }
  for (const mark of [
    ...clone.querySelectorAll('mark.memo-body-highlight'),
  ]) {
    const serialized =
      MEMO_HIGHLIGHT_OPEN +
      serializeEditorInlineNodes(mark.childNodes) +
      MEMO_HIGHLIGHT_CLOSE
    mark.replaceWith(document.createTextNode(serialized))
  }
  return clone
}

function isEmptyEditorBlock(el: HTMLElement): boolean {
  if (el.tagName !== 'DIV' && el.tagName !== 'P') return false
  if (el.querySelector('img[data-memo-emoji], mark.memo-body-highlight')) {
    return false
  }
  const stripped = (el.textContent ?? '').replace(/\u200B/g, '').trim()
  return stripped.length === 0
}

/** contenteditable → 저장 문자열 (빈 줄·줄바꿈 유지) */
export function memoBodyFromEditor(root: HTMLElement): string {
  const prepared = cloneForPlainTextRead(root)
  let out = ''

  for (const child of prepared.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? ''
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement

    if (el.tagName === 'BR') {
      out += '\n'
      continue
    }

    if (el.tagName === 'DIV' || el.tagName === 'P') {
      if (out.length > 0 && !out.endsWith('\n')) {
        out += '\n'
      }
      if (isEmptyEditorBlock(el)) {
        out += '\n'
      } else {
        out += serializeEditorInlineNodes(el.childNodes)
      }
      continue
    }

    out += serializeEditorInlineNodes([el])
  }

  return out
}

export function serializeMemoEditor(root: HTMLElement): string {
  return normalizeMemoBodyStorage(memoBodyFromEditor(root))
}

export function readMemoEditorBody(root: HTMLElement | null): string {
  if (!root) return ''
  return serializeMemoEditor(root)
}

export function isRangeInsideMemoEditor(root: HTMLElement, range: Range): boolean {
  return root.contains(range.startContainer) && root.contains(range.endContainer)
}

function createMemoEmojiImg(emoji: MemoQuickEmoji): HTMLImageElement {
  const img = document.createElement('img')
  img.src = emoji.iconSrc
  img.dataset.memoEmoji = emoji.id
  img.className = 'memo-body-inline-icon'
  img.draggable = false
  img.contentEditable = 'false'
  img.alt = emoji.label
  return img
}

export function insertMemoPlainTextInEditor(
  root: HTMLElement,
  text: string,
): boolean {
  if (!text) return false
  root.focus()
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!isRangeInsideMemoEditor(root, range)) return false
  range.deleteContents()
  range.insertNode(document.createTextNode(text))
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

export function insertMemoEmojiInEditor(root: HTMLElement, id: string): boolean {
  const emoji = memoEmojiById(id)
  if (!emoji) return false

  root.focus()
  const sel = window.getSelection()
  if (!sel) return false

  let range: Range
  if (sel.rangeCount > 0 && isRangeInsideMemoEditor(root, sel.getRangeAt(0))) {
    range = sel.getRangeAt(0)
  } else {
    range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
  }
  range.collapse(false)

  const img = createMemoEmojiImg(emoji)
  range.insertNode(img)

  const caret = document.createRange()
  caret.setStartAfter(img)
  caret.collapse(true)
  sel.removeAllRanges()
  sel.addRange(caret)
  return true
}

/** 붙여넣기 — 브라우저 insertText 우선 (줄바꿈 그대로) */
export function insertPlainTextInMemoEditor(
  root: HTMLElement,
  range: Range,
  rawText: string,
): void {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  root.focus()

  const sel = window.getSelection()
  if (sel) {
    sel.removeAllRanges()
    sel.addRange(range)
  }

  if (!text) return

  if (typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('insertText')) {
    document.execCommand('insertText', false, text)
    return
  }

  range.deleteContents()
  const frag = document.createDocumentFragment()
  const parts = text.split('\n')
  let last: Node | null = null
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      last = document.createElement('br')
      frag.appendChild(last)
    }
    if (parts[i]) {
      last = document.createTextNode(parts[i])
      frag.appendChild(last)
    }
  }
  range.insertNode(frag)
  if (last) {
    const caret = document.createRange()
    if (last.nodeType === Node.TEXT_NODE) {
      caret.setStart(last, (last as Text).length)
    } else {
      caret.setStartAfter(last)
    }
    caret.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(caret)
  }
}

function findHighlightMark(root: HTMLElement, node: Node): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  while (el && el !== root) {
    if (
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

function unwrapHighlightMark(mark: HTMLElement): void {
  const parent = mark.parentNode
  if (!parent) return
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }
  parent.removeChild(mark)
}

function rangeSelectsEntireHighlight(range: Range, mark: HTMLElement): boolean {
  const markRange = document.createRange()
  markRange.selectNodeContents(mark)
  return (
    range.compareBoundaryPoints(Range.START_TO_START, markRange) === 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, markRange) === 0
  )
}

/** 선택 영역 형광펜 — 다시 누르면(전체 선택 시) 제거 */
export function toggleMemoHighlightInEditor(root: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!isRangeInsideMemoEditor(root, range)) return false
  if (range.collapsed) return false

  root.focus()

  const startMark = findHighlightMark(root, range.startContainer)
  const endMark = findHighlightMark(root, range.endContainer)
  if (
    startMark &&
    startMark === endMark &&
    rangeSelectsEntireHighlight(range, startMark)
  ) {
    unwrapHighlightMark(startMark)
    sel.removeAllRanges()
    return true
  }

  const mark = document.createElement('mark')
  mark.className = 'memo-body-highlight'
  mark.dataset.memoHighlight = '1'

  try {
    const extracted = range.extractContents()
    range.insertNode(mark)
    mark.appendChild(extracted)
    const caret = document.createRange()
    caret.setStartAfter(mark)
    caret.collapse(true)
    sel.removeAllRanges()
    sel.addRange(caret)
    return true
  } catch {
    try {
      range.surroundContents(mark)
      const caret = document.createRange()
      caret.setStartAfter(mark)
      caret.collapse(true)
      sel.removeAllRanges()
      sel.addRange(caret)
      return true
    } catch {
      return false
    }
  }
}
