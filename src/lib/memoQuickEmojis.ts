import arrowrightIcon from '../assets/memo-emojis/arrowright.svg'
import checkIcon from '../assets/memo-emojis/check.svg'
import faceIcon from '../assets/memo-emojis/face.svg'
import musicIcon from '../assets/memo-emojis/music.svg'
import noIcon from '../assets/memo-emojis/no.svg'
import okIcon from '../assets/memo-emojis/ok.svg'
import startIcon from '../assets/memo-emojis/start.svg'
import thinkingIcon from '../assets/memo-emojis/thinking.svg'
import uncheckIcon from '../assets/memo-emojis/uncheck.svg'
import { cleanPastedMemoText } from './pasteNoteFormat'

export type MemoQuickEmoji = {
  id: string
  label: string
  iconSrc: string
  /** 예전에 유니코드로 저장된 메모 호환 */
  legacyUnicode?: string
}

export const MEMO_QUICK_EMOJIS: MemoQuickEmoji[] = [
  {
    id: 'start',
    label: '별',
    iconSrc: startIcon,
    legacyUnicode: '💡',
  },
  {
    id: 'arrowright',
    label: '가리키기',
    iconSrc: arrowrightIcon,
    legacyUnicode: '👉🏻',
  },
  {
    id: 'music',
    label: '음악',
    iconSrc: musicIcon,
    legacyUnicode: '🎧',
  },
  {
    id: 'uncheck',
    label: '빈 칸',
    iconSrc: uncheckIcon,
    legacyUnicode: '◽️',
  },
  {
    id: 'check',
    label: '체크',
    iconSrc: checkIcon,
    legacyUnicode: '✔️',
  },
  {
    id: 'ok',
    label: '동그라미',
    iconSrc: okIcon,
    legacyUnicode: '⭕️',
  },
  { id: 'no', label: '거절', iconSrc: noIcon, legacyUnicode: '❌' },
  {
    id: 'thinking',
    label: '생각',
    iconSrc: thinkingIcon,
    legacyUnicode: '💭',
  },
  { id: 'face', label: '얼굴', iconSrc: faceIcon },
]

/** 예전 :m/lightbulb: 등 DB 토큰 → 새 아이콘 */
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

/** 커서용 — 직렬화 시 제거 */
export const MEMO_EDITOR_ZWSP = '\u200B'

/** DB에 저장되는 짧은 토큰 — 예: :m/start: */
export const MEMO_EMOJI_TOKEN_RE = new RegExp(
  `:m\\/(${MEMO_EMOJI_TOKEN_IDS}):`,
  'g',
)

export function memoEmojiToken(id: string): string {
  return `:m/${id}:`
}

/** 입력 `->` 등을 고정 아이콘 토큰으로 치환 */
const MEMO_TEXT_SHORTCUTS: { pattern: RegExp; id: string }[] = [
  { pattern: /->/g, id: 'arrowright' },
]

/** 줄 시작 `- `·`•` 등 → 빈 칸(uncheck) */
const MEMO_BULLET_LINE_PREFIX_RE = /(^|\n)(?:-\s+|[•·‣◦\u2022\u2043\u25E6]\s*)/g
const MEMO_STAR_LINE_PREFIX_RE = /(^|\n)\*\s/g

const MEMO_IN_EDITOR_SHORTCUTS: {
  suffix: string
  id: string
  lineStartOnly?: boolean
}[] = [
  { suffix: '->', id: 'arrowright' },
  { suffix: '- ', id: 'uncheck', lineStartOnly: true },
  { suffix: '* ', id: 'start', lineStartOnly: true },
  { suffix: '• ', id: 'uncheck', lineStartOnly: true },
  { suffix: '· ', id: 'uncheck', lineStartOnly: true },
  { suffix: '•', id: 'uncheck', lineStartOnly: true },
  { suffix: '·', id: 'uncheck', lineStartOnly: true },
]

/** 붙여넣기·외부 글머리 등 → 빈 칸(uncheck) 아이콘 */
const UNCHECK_LEGACY_BOXES = [
  '■',
  '□',
  '▪',
  '▫',
  '◻',
  '▢',
  '◽',
  '◽️',
]

function replaceUncheckLegacyBoxes(text: string): string {
  let result = text
  for (const box of UNCHECK_LEGACY_BOXES) {
    const esc = box.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`(^|\\n)${esc}\\s*`, 'g'),
      (_, lineBreak) => `${lineBreak}${memoEmojiToken('uncheck')}`,
    )
    if (result.includes(box)) {
      result = result.split(box).join(memoEmojiToken('uncheck'))
    }
  }
  return result
}

/** 에디터 DOM ↔ 저장 문자열 동기화 + `•`·`-` 등 글머리를 uncheck 아이콘으로 */
export function reconcileMemoEditorShortcuts(root: HTMLElement): string {
  const raw = normalizeMemoBodyStorage(memoBodyFromEditor(root))
  const next = applyMemoTextShortcuts(raw)
  if (next === raw) {
    return next
  }

  const sel = window.getSelection()
  let rawCursor = raw.length
  if (
    sel &&
    sel.rangeCount > 0 &&
    sel.anchorNode &&
    root.contains(sel.anchorNode)
  ) {
    rawCursor = serializedOffsetInEditor(
      root,
      sel.anchorNode,
      sel.anchorOffset,
    )
  }

  const newCursor = serializedLengthOfMemoPrefix(
    applyMemoTextShortcuts(normalizeMemoBodyStorage(raw.slice(0, rawCursor))),
  )
  root.innerHTML = next ? memoBodyToEditorHtml(next) : ''
  requestAnimationFrame(() => {
    setSelectionAtSerializedOffset(root, newCursor)
  })
  return next
}

export function applyMemoTextShortcuts(body: string): string {
  let result = body
  for (const { pattern, id } of MEMO_TEXT_SHORTCUTS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, memoEmojiToken(id))
  }
  result = result.replace(
    MEMO_BULLET_LINE_PREFIX_RE,
    (_, lineBreak) => `${lineBreak}${memoEmojiToken('uncheck')} `,
  )
  result = result.replace(
    MEMO_STAR_LINE_PREFIX_RE,
    (_, lineBreak) => `${lineBreak}${memoEmojiToken('start')} `,
  )
  result = replaceUncheckLegacyBoxes(result)
  return result
}

export function memoEmojiById(id: string): MemoQuickEmoji | undefined {
  const resolved = MEMO_EMOJI_LEGACY_IDS[id] ?? id
  return MEMO_EMOJI_BY_ID.get(resolved)
}

export type MemoBodySegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; id: string; emoji: MemoQuickEmoji }

/** 본문을 텍스트·고정 아이콘 구간으로 나눔 (토큰 + 예전 유니코드) */
export function parseMemoBody(body: string): MemoBodySegment[] {
  const normalized = applyMemoTextShortcuts(body)
  if (!normalized) {
    return []
  }

  type Mark = { index: number; length: number; id: string }
  const marks: Mark[] = []

  MEMO_EMOJI_TOKEN_RE.lastIndex = 0
  let tokenMatch: RegExpExecArray | null
  while ((tokenMatch = MEMO_EMOJI_TOKEN_RE.exec(normalized)) !== null) {
    marks.push({
      index: tokenMatch.index,
      length: tokenMatch[0].length,
      id: tokenMatch[1],
    })
  }

  for (const emoji of MEMO_QUICK_EMOJIS) {
    if (!emoji.legacyUnicode) continue
    let from = 0
    while (from < normalized.length) {
      const idx = normalized.indexOf(emoji.legacyUnicode, from)
      if (idx === -1) break
      marks.push({
        index: idx,
        length: emoji.legacyUnicode.length,
        id: emoji.id,
      })
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
      segments.push({ type: 'text', value: normalized.slice(pos, mark.index) })
    }
    const emoji = memoEmojiById(mark.id)
    if (emoji) {
      segments.push({ type: 'emoji', id: emoji.id, emoji })
    } else {
      segments.push({
        type: 'text',
        value: normalized.slice(mark.index, mark.index + mark.length),
      })
    }
    pos = mark.index + mark.length
  }

  if (pos < normalized.length) {
    segments.push({ type: 'text', value: normalized.slice(pos) })
  }

  return segments
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function memoBodyToEditorHtml(body: string): string {
  return parseMemoBody(body)
    .map((seg) => {
      if (seg.type === 'text') {
        return escapeHtml(seg.value).replace(/\n/g, '<br>')
      }
      const { emoji } = seg
      return `<img class="memo-body-inline-icon" data-memo-emoji="${emoji.id}" src="${emoji.iconSrc}" alt="${emoji.label}" draggable="false" contenteditable="false" />`
    })
    .join('')
}

function stripEditorZwsp(text: string): string {
  return text.replaceAll(MEMO_EDITOR_ZWSP, '')
}

function blockHasMeaningfulContent(el: HTMLElement): boolean {
  if (el.querySelector('img[data-memo-emoji]')) return true
  return stripEditorZwsp(el.textContent ?? '').length > 0
}

function isCaretOnlyBlock(el: HTMLElement): boolean {
  if (el.tagName !== 'DIV' && el.tagName !== 'P') return false
  if (blockHasMeaningfulContent(el)) return false
  if (el.childNodes.length === 0) return true
  if (el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR') return true
  return stripEditorZwsp(el.textContent ?? '').length === 0
}

/** contenteditable DOM → 저장 문자열 (아이콘 옆 불필요 줄바꿈 없음) */
export function memoBodyFromEditor(root: HTMLElement): string {
  let out = ''

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      out += stripEditorZwsp(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }
    const el = node as HTMLElement

    if (el.tagName === 'BR') {
      out += '\n'
      return
    }
    if (el.tagName === 'IMG' && el.dataset.memoEmoji) {
      out += memoEmojiToken(el.dataset.memoEmoji)
      return
    }

    if (
      (el.tagName === 'DIV' || el.tagName === 'P') &&
      el.parentElement === root
    ) {
      if (isCaretOnlyBlock(el)) {
        return
      }
      if (out.length > 0 && !out.endsWith('\n')) {
        out += '\n'
      }
      for (const child of el.childNodes) {
        walk(child)
      }
      return
    }

    for (const child of el.childNodes) {
      walk(child)
    }
  }

  for (const child of root.childNodes) {
    walk(child)
  }

  return out.replace(/\n+$/, '')
}

export function serializedOffsetInEditor(
  root: HTMLElement,
  container: Node,
  offset: number,
): number {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(container, offset)
  const tmp = document.createElement('div')
  tmp.appendChild(range.cloneContents())
  return memoBodyFromEditor(tmp).length
}

/** 붙여넣기·치환 후 직렬화 문자열에서 커서 offset */
export function serializedLengthOfMemoPrefix(prefix: string): number {
  return applyMemoTextShortcuts(normalizeMemoBodyStorage(prefix)).length
}

function domChildIndex(node: Node): number {
  const parent = node.parentNode
  if (!parent) return 0
  return Array.from(parent.childNodes).indexOf(node as ChildNode)
}

/** 직렬화 offset 위치로 contenteditable 커서 복원 */
export function setSelectionAtSerializedOffset(
  root: HTMLElement,
  target: number,
): boolean {
  const sel = window.getSelection()
  if (!sel) return false

  root.focus()

  const range = document.createRange()

  if (target <= 0) {
    range.setStart(root, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }

  let pos = 0
  let foundNode: Node | null = null
  let foundOffset = 0

  function markFound(node: Node, offset: number): void {
    foundNode = node
    foundOffset = offset
  }

  function advanceText(text: string, node: Node): void {
    if (foundNode) return
    const raw = text
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === MEMO_EDITOR_ZWSP) continue
      if (pos + 1 >= target) {
        markFound(node, i + 1)
        return
      }
      pos += 1
    }
  }

  function walk(node: Node): void {
    if (foundNode) return

    if (node.nodeType === Node.TEXT_NODE) {
      advanceText(node.textContent ?? '', node)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement

    if (el.tagName === 'BR') {
      if (pos + 1 >= target) {
        const parent = el.parentNode!
        markFound(parent, domChildIndex(el))
        return
      }
      pos += 1
      return
    }

    if (el.tagName === 'IMG' && el.dataset.memoEmoji) {
      const len = memoEmojiToken(el.dataset.memoEmoji).length
      if (pos + len >= target) {
        const parent = el.parentNode!
        markFound(parent, domChildIndex(el) + 1)
        return
      }
      pos += len
      return
    }

    if (
      (el.tagName === 'DIV' || el.tagName === 'P') &&
      el.parentElement === root
    ) {
      if (isCaretOnlyBlock(el)) return
      if (pos > 0) {
        if (pos + 1 >= target) {
          if (el.firstChild?.nodeType === Node.TEXT_NODE) {
            markFound(el.firstChild, 0)
          } else {
            markFound(el, 0)
          }
          return
        }
        pos += 1
      }
      for (const child of el.childNodes) walk(child)
      return
    }

    for (const child of el.childNodes) walk(child)
  }

  for (const child of root.childNodes) walk(child)

  if (foundNode !== null) {
    range.setStart(foundNode, foundOffset)
  } else {
    range.selectNodeContents(root)
    range.collapse(false)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

function getLinePrefixBeforeCursor(root: HTMLElement, range: Range): string {
  const lineRange = document.createRange()
  lineRange.selectNodeContents(root)
  lineRange.setEnd(range.startContainer, range.startOffset)
  const tmp = document.createElement('div')
  tmp.appendChild(lineRange.cloneContents())
  const serialized = memoBodyFromEditor(tmp)
  const lastBreak = serialized.lastIndexOf('\n')
  return lastBreak === -1 ? serialized : serialized.slice(lastBreak + 1)
}

function deleteStrippedCharsBeforeCursor(
  range: Range,
  count: number,
): Range | null {
  if (range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null
  }
  const textNode = range.startContainer as Text
  const raw = textNode.textContent ?? ''
  let offset = range.startOffset
  let deleted = 0
  while (offset > 0 && deleted < count) {
    offset -= 1
    if (raw[offset] === MEMO_EDITOR_ZWSP) {
      continue
    }
    deleted += 1
  }
  if (deleted < count) {
    return null
  }
  const deleteRange = document.createRange()
  deleteRange.setStart(textNode, offset)
  deleteRange.setEnd(textNode, range.startOffset)
  deleteRange.deleteContents()
  const collapsed = document.createRange()
  collapsed.setStart(textNode, offset)
  collapsed.collapse(true)
  return collapsed
}

/** `->`, 줄 시작 `- `·`•` 등을 고정 아이콘으로 치환 */
export function applyMemoTextShortcutsInEditor(root: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return false
  }

  const range = sel.getRangeAt(0)
  if (!range.collapsed || !root.contains(range.startContainer)) {
    return false
  }

  const linePrefix = getLinePrefixBeforeCursor(root, range)
  const shortcuts = [...MEMO_IN_EDITOR_SHORTCUTS].sort(
    (a, b) => b.suffix.length - a.suffix.length,
  )

  for (const { suffix, id, lineStartOnly } of shortcuts) {
    if (!linePrefix.endsWith(suffix)) {
      continue
    }
    if (lineStartOnly && linePrefix !== suffix) {
      continue
    }

    const collapsed = deleteStrippedCharsBeforeCursor(range, suffix.length)
    if (!collapsed) {
      continue
    }

    sel.removeAllRanges()
    sel.addRange(collapsed)
    return insertMemoEmojiInEditor(root, id)
  }

  return false
}

function isNodeInsideMemoEditor(root: HTMLElement, node: Node): boolean {
  return root === node || root.contains(node)
}

export function isRangeInsideMemoEditor(root: HTMLElement, range: Range): boolean {
  return (
    isNodeInsideMemoEditor(root, range.startContainer) &&
    isNodeInsideMemoEditor(root, range.endContainer)
  )
}

/** Range 기준 직렬화 선택 구간 — anchor/focus보다 붙여넣기에 정확 */
export function getMemoEditorSelectionOffsets(
  root: HTMLElement,
  range?: Range | null,
): { start: number; end: number } {
  const fallbackLen = memoBodyFromEditor(root).length

  let r = range
  if (!r) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      r = sel.getRangeAt(0)
    }
  }

  if (!r || !isRangeInsideMemoEditor(root, r)) {
    return { start: fallbackLen, end: fallbackLen }
  }

  const start = serializedOffsetInEditor(
    root,
    r.startContainer,
    r.startOffset,
  )
  const end = serializedOffsetInEditor(root, r.endContainer, r.endOffset)
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  }
}

/** 커서·선택 위치에 평문 붙여넣기 (DOM 직접 삽입) */
export function insertPlainTextInMemoEditor(
  root: HTMLElement,
  range: Range,
  rawText: string,
): void {
  root.focus()

  const insert = applyMemoTextShortcuts(
    cleanPastedMemoText(
      rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    ),
  )

  const r = range.cloneRange()
  r.deleteContents()

  if (!insert) {
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(r)
    }
    return
  }

  const holder = document.createElement('div')
  holder.innerHTML = memoBodyToEditorHtml(insert)

  const frag = document.createDocumentFragment()
  let lastInserted: Node | null = null
  while (holder.firstChild) {
    lastInserted = holder.firstChild
    frag.appendChild(lastInserted)
  }

  r.insertNode(frag)

  const sel = window.getSelection()
  if (!sel) return

  const caret = document.createRange()
  if (lastInserted) {
    if (lastInserted.nodeType === Node.TEXT_NODE) {
      caret.setStart(lastInserted, (lastInserted as Text).length)
    } else if (
      lastInserted.nodeType === Node.ELEMENT_NODE &&
      (lastInserted as HTMLElement).tagName === 'BR'
    ) {
      const parent = lastInserted.parentNode!
      caret.setStart(parent, domChildIndex(lastInserted) + 1)
    } else {
      caret.setStartAfter(lastInserted)
    }
  } else {
    caret.setStart(r.startContainer, r.startOffset)
  }
  caret.collapse(true)
  sel.removeAllRanges()
  sel.addRange(caret)
}

export function insertMemoEmojiInEditor(root: HTMLElement, id: string): boolean {
  const emoji = memoEmojiById(id)
  if (!emoji) {
    return false
  }

  root.focus()
  const sel = window.getSelection()
  if (!sel) {
    return false
  }

  let range: Range
  if (
    sel.rangeCount === 0 ||
    !sel.anchorNode ||
    !isRangeInsideMemoEditor(root, sel.getRangeAt(0))
  ) {
    range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
  } else {
    range = sel.getRangeAt(0)
  }

  range.deleteContents()

  const img = document.createElement('img')
  img.src = emoji.iconSrc
  img.dataset.memoEmoji = emoji.id
  img.className = 'memo-body-inline-icon'
  img.draggable = false
  img.contentEditable = 'false'
  img.alt = emoji.label

  const caret = document.createTextNode(MEMO_EDITOR_ZWSP)
  range.insertNode(caret)
  range.insertNode(img)
  range.setStart(caret, 1)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

/** 저장된 본문에 아이콘 뒤 불필요 줄바꿈이 섞였을 때 정리 */
export function normalizeMemoBodyStorage(body: string): string {
  return body
    .replace(/:m\/enter:/g, '')
    .replace(
      new RegExp(`(:m\\/(${MEMO_EMOJI_TOKEN_IDS}):)\\n+(?!\\n)`, 'g'),
      '$1',
    )
    .replace(/\n{3,}/g, '\n\n')
}
