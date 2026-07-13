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

/** 메모 바 — ①~⑨ 빠른 삽입 */
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

/** 형광펜 — :m/hi:내용:/m/hi: */
export const MEMO_HIGHLIGHT_OPEN = ':m/hi:'
export const MEMO_HIGHLIGHT_CLOSE = ':/m/hi:'
const MEMO_HIGHLIGHT_PARSE_MAX_DEPTH = 24

export function memoEmojiToken(id: string): string {
  return `:m/${id}:`
}

/** DB·입력에 섞인 유니코드 이모지 → 바와 동일한 토큰 */
export function normalizeLegacyUnicodeInString(body: string): string {
  let result = body
  for (const emoji of MEMO_QUICK_EMOJIS) {
    if (!emoji.legacyUnicode) continue
    if (!result.includes(emoji.legacyUnicode)) continue
    result = result.split(emoji.legacyUnicode).join(memoEmojiToken(emoji.id))
  }
  return result
}

function textHasQuickEmojiMarkup(text: string): boolean {
  if (MEMO_EMOJI_TOKEN_RE.test(text)) {
    MEMO_EMOJI_TOKEN_RE.lastIndex = 0
    return true
  }
  for (const emoji of MEMO_QUICK_EMOJIS) {
    if (emoji.legacyUnicode && text.includes(emoji.legacyUnicode)) {
      return true
    }
  }
  return false
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

/** 텍스트 조각 → DOM (바 클릭과 동일한 img 삽입) */
function appendParsedSegmentsToParent(
  parent: Node,
  segments: MemoBodySegment[],
): Node | null {
  let last: Node | null = null
  for (const seg of segments) {
    if (seg.type === 'text') {
      if (!seg.value) continue
      last = document.createTextNode(seg.value)
      parent.appendChild(last)
      continue
    }
    if (seg.type === 'highlight') {
      const mark = document.createElement('mark')
      mark.className = 'memo-body-highlight'
      mark.dataset.memoHighlight = '1'
      parent.appendChild(mark)
      const innerLast = appendParsedSegmentsToParent(mark, seg.children)
      last = innerLast ?? mark
      continue
    }
    const img = createMemoEmojiImg(seg.emoji)
    parent.appendChild(img)
    last = img
  }
  return last
}

function appendMemoSegmentsToFragment(
  frag: DocumentFragment,
  text: string,
): Node | null {
  return appendParsedSegmentsToParent(frag, parseMemoBody(text))
}

function textHasMemoInlineMarkup(text: string): boolean {
  if (text.includes(MEMO_HIGHLIGHT_OPEN)) return true
  return textHasQuickEmojiMarkup(text)
}

/** 입력·붙여넣기 텍스트의 유니코드/토큰 → 바와 같은 img */
export function normalizeQuickEmojisInEditor(root: HTMLElement): boolean {
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parentEl =
      node.parentElement?.closest('mark.memo-body-highlight') ?? null
    if (parentEl) continue

    const text = stripEditorZwsp(node.textContent ?? '')
    if (text && textHasMemoInlineMarkup(text)) {
      textNodes.push(node as Text)
    }
  }

  if (textNodes.length === 0) return false

  for (const textNode of textNodes) {
    const raw = textNode.textContent ?? ''
    const text = stripEditorZwsp(raw)
    if (!text || !textHasMemoInlineMarkup(text)) continue

    const parent = textNode.parentNode
    if (!parent) continue

    const frag = document.createDocumentFragment()
    appendMemoSegmentsToFragment(frag, text)
    if (frag.childNodes.length === 0) continue

    parent.insertBefore(frag, textNode)
    parent.removeChild(textNode)
  }

  return true
}

function flattenMemoEditorLists(root: HTMLElement): boolean {
  if (!root.querySelector('ul, ol, li')) {
    return false
  }
  const serialized = normalizeLegacyUnicodeInString(
    normalizeMemoBodyStorage(memoBodyFromEditor(root)),
  )
  root.innerHTML = serialized ? memoBodyToEditorHtml(serialized) : ''
  return true
}

/** 에디터 DOM → 저장 문자열 */
export function serializeMemoEditor(root: HTMLElement): string {
  try {
    normalizeQuickEmojisInEditor(root)
    if (flattenMemoEditorLists(root)) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
        setSelectionAtSerializedOffset(root, memoBodyFromEditor(root).length)
      }
    }
    return normalizeLegacyUnicodeInString(
      normalizeMemoBodyStorage(memoBodyFromEditor(root)),
    )
  } catch {
    return normalizeLegacyUnicodeInString(
      normalizeMemoBodyStorage(memoBodyFromEditor(root)),
    )
  }
}

/** 저장 직전 — contenteditable에서 본문 읽기 */
export function readMemoEditorBody(root: HTMLElement | null): string {
  if (!root) return ''
  return serializeMemoEditor(root)
}

export function memoEmojiById(id: string): MemoQuickEmoji | undefined {
  const resolved = MEMO_EMOJI_LEGACY_IDS[id] ?? id
  return MEMO_EMOJI_BY_ID.get(resolved)
}

/** 저장 문자열 offset에 텍스트(또는 이모티콘 토큰) 삽입 */
export function insertMemoTextInBody(
  body: string,
  offset: number,
  insertText: string,
): { body: string; cursorOffset: number } {
  return applyMemoTextPasteToBody(body, insertText, offset, offset)
}

export type MemoBodySegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; id: string; emoji: MemoQuickEmoji }
  | { type: 'highlight'; children: MemoBodySegment[] }

function parseMemoBodyEmojiOnly(text: string): MemoBodySegment[] {
  if (!text) {
    return []
  }

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

/** 본문을 텍스트·형광·고정 아이콘 구간으로 나눔 */
export function parseMemoBody(body: string): MemoBodySegment[] {
  const normalized = normalizeMemoBodyStorage(body)
  if (!normalized) {
    return []
  }
  return parseMemoBodySegments(normalized)
}

export function escapeHtml(text: string): string {
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

export function memoBodyToEditorHtml(body: string): string {
  return segmentsToEditorHtml(parseMemoBody(body))
}

function stripEditorZwsp(text: string): string {
  return text.replaceAll(MEMO_EDITOR_ZWSP, '')
}

function blockHasMeaningfulContent(el: HTMLElement): boolean {
  if (el.querySelector('img[data-memo-emoji]')) return true
  if (el.querySelector('mark.memo-body-highlight')) return true
  return stripEditorZwsp(el.textContent ?? '').length > 0
}

function isCaretOnlyBlock(el: HTMLElement): boolean {
  if (el.tagName !== 'DIV' && el.tagName !== 'P') return false
  if (blockHasMeaningfulContent(el)) return false
  if (el.childNodes.length === 0) return true
  if (el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR') return true
  return stripEditorZwsp(el.textContent ?? '').length === 0
}

/** 빈 줄 블록(div/p) — br·중첩 빈 블록이면 줄바꿈만큼 출력 */
function walkCaretOnlyBlock(out: string, el: HTMLElement): string {
  let brCount = 0
  for (const child of el.childNodes) {
    if (child.nodeName === 'BR') brCount += 1
  }
  if (brCount > 0) {
    return out + '\n'.repeat(brCount)
  }
  let nested = out
  for (const child of el.childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const childEl = child as HTMLElement
    if (
      (childEl.tagName === 'DIV' || childEl.tagName === 'P') &&
      isCaretOnlyBlock(childEl)
    ) {
      nested = walkCaretOnlyBlock(nested, childEl)
    }
  }
  if (nested.length > out.length) {
    return nested
  }
  return out + '\n'
}

function findMemoEditorRootBlock(
  root: HTMLElement,
  node: Node,
): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  while (el && el !== root) {
    if (
      (el.tagName === 'DIV' || el.tagName === 'P') &&
      el.parentElement === root
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

/** 이전 블록 경계와 겹치는 선행 BR (타이핑 시 `<div><br>a</div>`) */
function shouldSkipLeadingRootBlockBr(
  el: HTMLElement,
  blockIndex: number,
): boolean {
  if (blockIndex <= 0) return false
  if (!blockHasMeaningfulContent(el)) return false
  const first = el.firstChild
  if (!first || first.nodeName !== 'BR') return false
  for (let n = first.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType === Node.TEXT_NODE) {
      return stripEditorZwsp(n.textContent ?? '').length > 0
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      const child = n as HTMLElement
      if (child.tagName === 'IMG' && child.dataset.memoEmoji) return false
      if (
        child.tagName === 'MARK' &&
        child.classList.contains('memo-body-highlight')
      ) {
        return false
      }
    }
  }
  return false
}

/** contenteditable DOM → 저장 문자열 (아이콘 옆 불필요 줄바꿈 없음) */
export function memoBodyFromEditor(root: HTMLElement): string {
  let out = ''

  function walkInline(node: Node): void {
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
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      out += MEMO_HIGHLIGHT_OPEN
      for (const child of el.childNodes) {
        walkInline(child)
      }
      out += MEMO_HIGHLIGHT_CLOSE
      return
    }

    for (const child of el.childNodes) {
      walkInline(child)
    }
  }

  function walkRootBlock(el: HTMLElement, blockIndex: number): void {
    if (isCaretOnlyBlock(el)) {
      out = walkCaretOnlyBlock(out, el)
      return
    }
    if (blockIndex > 0 && out.length > 0 && !out.endsWith('\n')) {
      out += '\n'
    }
    const skipLeadingBr = shouldSkipLeadingRootBlockBr(el, blockIndex)
    for (const child of el.childNodes) {
      if (skipLeadingBr && child === el.firstChild && child.nodeName === 'BR') {
        continue
      }
      walkInline(child)
    }
  }

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
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      out += MEMO_HIGHLIGHT_OPEN
      for (const child of el.childNodes) {
        walkInline(child)
      }
      out += MEMO_HIGHLIGHT_CLOSE
      return
    }

    if (el.tagName === 'LI') {
      if (out.length > 0 && !out.endsWith('\n')) {
        out += '\n'
      }
      for (const child of el.childNodes) {
        walkInline(child)
      }
      return
    }
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      for (const child of el.childNodes) {
        walk(child)
      }
      return
    }

    if (
      (el.tagName === 'DIV' || el.tagName === 'P') &&
      el.parentElement === root
    ) {
      walkRootBlock(el, 0)
      return
    }

    for (const child of el.childNodes) {
      walk(child)
    }
  }

  let rootBlockIndex = 0
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += stripEditorZwsp(child.textContent ?? '')
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue
    }
    const el = child as HTMLElement

    if (el.tagName === 'BR') {
      out += '\n'
      continue
    }
    if (el.tagName === 'IMG' && el.dataset.memoEmoji) {
      out += memoEmojiToken(el.dataset.memoEmoji)
      continue
    }
    if (
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      out += MEMO_HIGHLIGHT_OPEN
      for (const c of el.childNodes) {
        walkInline(c)
      }
      out += MEMO_HIGHLIGHT_CLOSE
      continue
    }
    if (el.tagName === 'LI') {
      if (out.length > 0 && !out.endsWith('\n')) {
        out += '\n'
      }
      for (const c of el.childNodes) {
        walkInline(c)
      }
      continue
    }
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      walk(el)
      continue
    }
    if (el.tagName === 'DIV' || el.tagName === 'P') {
      walkRootBlock(el, rootBlockIndex)
      rootBlockIndex += 1
      continue
    }

    walk(el)
  }

  return out
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
  return normalizeLegacyUnicodeInString(normalizeMemoBodyStorage(prefix)).length
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
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      if (pos + MEMO_HIGHLIGHT_OPEN.length >= target) {
        markFound(el, 0)
        return
      }
      pos += MEMO_HIGHLIGHT_OPEN.length
      for (const child of el.childNodes) {
        walk(child)
        if (foundNode) return
      }
      if (pos + MEMO_HIGHLIGHT_CLOSE.length >= target) {
        markFound(el, el.childNodes.length)
        return
      }
      pos += MEMO_HIGHLIGHT_CLOSE.length
      return
    }

    if (
      (el.tagName === 'DIV' || el.tagName === 'P') &&
      el.parentElement === root
    ) {
      if (isCaretOnlyBlock(el)) {
        let brCount = 0
        for (const child of el.childNodes) {
          if (child.nodeName === 'BR') brCount += 1
        }
        const blockLen = Math.max(1, brCount)
        if (pos + blockLen >= target) {
          markFound(el, 0)
          return
        }
        pos += blockLen
        return
      }
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

function isStructuralOnlyMemoText(text: string): boolean {
  const stripped = text
    .replaceAll(MEMO_EDITOR_ZWSP, '')
    .replace(new RegExp(MEMO_EMOJI_TOKEN_RE.source, 'g'), '')
  return stripped.length === 0 || /^[\n\s]*$/.test(stripped)
}

/** Range 안의 직렬화 텍스트 (붙여넣기 선택 판별용) */
export function serializedTextInEditorRange(range: Range): string {
  const tmp = document.createElement('div')
  tmp.appendChild(range.cloneContents())
  return memoBodyFromEditor(tmp)
}

function isStructuralOnlyEditorSelection(text: string): boolean {
  return isStructuralOnlyMemoText(text)
}

/**
 * 삽입 전 Range 정리 — 줄바꿈·빈 줄만 가리키는 선택은 지우지 않고 focus 끝으로 접음.
 * (Enter 후 anchor가 위 줄에 남아 있으면 deleteContents가 본문을 통째로 지움)
 */
function prepareMemoEditorInsertRange(range: Range): Range {
  const r = range.cloneRange()
  if (r.collapsed) {
    return r
  }

  const selected = serializedTextInEditorRange(r)
  if (isStructuralOnlyEditorSelection(selected)) {
    r.collapse(false)
    return r
  }

  r.deleteContents()
  return r
}

/**
 * 저장 문자열에 평문 붙여넣기 — 줄바꿈·이모티콘 토큰은 삭제하지 않음.
 */
export function applyMemoTextPasteToBody(
  body: string,
  insertText: string,
  selectionStart: number,
  selectionEnd: number,
): { body: string; cursorOffset: number } {
  const len = body.length
  let start = Math.max(0, Math.min(selectionStart, len))
  let end = Math.max(start, Math.min(selectionEnd, len))

  if (end > start) {
    const deleted = body.slice(start, end)
    if (isStructuralOnlyMemoText(deleted)) {
      end = start
    }
  }

  const before = body.slice(0, start)
  const after = body.slice(end)
  const merged = `${before}${insertText}${after}`
  const cursorOffset = serializedLengthOfMemoPrefix(`${before}${insertText}`)
  return { body: merged, cursorOffset }
}

/**
 * 붙여넣기 삽입 위치 — 빈 줄·ZWSP만 가리키는 비접힘 Range는
 * focus 끝으로 접어서 줄바꿈이 잘리지 않게 함.
 */
export function getMemoEditorPasteOffsets(
  root: HTMLElement,
  range: Range,
): { start: number; end: number } {
  if (range.collapsed) {
    const point = getMemoEditorSelectionOffsets(root, range).start
    return { start: point, end: point }
  }

  const selected = serializedTextInEditorRange(range)
  if (isStructuralOnlyEditorSelection(selected)) {
    const collapsed = range.cloneRange()
    collapsed.collapse(false)
    const point = getMemoEditorSelectionOffsets(root, collapsed).start
    return { start: point, end: point }
  }

  return getMemoEditorSelectionOffsets(root, range)
}

/** 커서·선택 위치에 평문 붙여넣기 — 커서 위치에 그대로 삽입 */
export function insertPlainTextInMemoEditor(
  root: HTMLElement,
  range: Range,
  rawText: string,
): void {
  root.focus()

  const insert = cleanPastedMemoText(
    rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    { trimWhole: false },
  )

  const r = prepareMemoEditorInsertRange(range)

  if (!insert) {
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(r)
    }
    return
  }

  const frag = document.createDocumentFragment()
  const parts = insert.split('\n')
  let lastInserted: Node | null = null

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      lastInserted = document.createElement('br')
      frag.appendChild(lastInserted)
    }
    const lineLast = appendMemoSegmentsToFragment(frag, parts[i])
    if (lineLast) lastInserted = lineLast
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

function resolveMemoEditorInsertRange(
  root: HTMLElement,
  sel: Selection,
): Range {
  if (
    sel.rangeCount === 0 ||
    !sel.anchorNode ||
    !isRangeInsideMemoEditor(root, sel.getRangeAt(0))
  ) {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    return range
  }
  return sel.getRangeAt(0)
}

export function insertMemoPlainTextInEditor(
  root: HTMLElement,
  text: string,
): boolean {
  if (!text) return false

  root.focus()
  const sel = window.getSelection()
  if (!sel) return false

  const range = prepareMemoEditorInsertRange(
    resolveMemoEditorInsertRange(root, sel),
  )

  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
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

  const range = resolveMemoEditorInsertRange(root, sel)
  range.collapse(false)

  const img = createMemoEmojiImg(emoji)
  const block = findMemoEditorRootBlock(root, range.startContainer)
  if (block && isCaretOnlyBlock(block)) {
    const brs = block.querySelectorAll('br')
    const anchorBr = brs.length > 0 ? brs[brs.length - 1] : null
    if (anchorBr?.parentNode) {
      anchorBr.parentNode.insertBefore(img, anchorBr.nextSibling)
      const caret = document.createRange()
      caret.setStartAfter(img)
      caret.collapse(true)
      sel.removeAllRanges()
      sel.addRange(caret)
      return true
    }
  }

  range.insertNode(img)

  const caret = document.createRange()
  caret.setStartAfter(img)
  caret.collapse(true)
  sel.removeAllRanges()
  sel.addRange(caret)
  return true
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

/** 저장된 본문 정리 — 줄바꿈은 유지 */
export function normalizeMemoBodyStorage(body: string): string {
  return body.replace(/:m\/enter:/g, '').replace(/\n{3,}/g, '\n\n')
}

function countMemoBodyNewlines(body: string): number {
  let count = 0
  for (const ch of body) {
    if (ch === '\n') count += 1
  }
  return count
}

/**
 * DOM 직렬화가 줄바꿈만 잃었을 때 이전 본문 유지.
 * (퀵 이모티콘·붙여넣기 전 emitChange 등)
 */
export function coalesceMemoEditorBody(
  previous: string | null | undefined,
  next: string,
): string {
  if (!previous || previous === next) return next
  const prevNorm = normalizeLegacyUnicodeInString(
    normalizeMemoBodyStorage(previous),
  )
  const nextNorm = normalizeLegacyUnicodeInString(normalizeMemoBodyStorage(next))
  if (prevNorm === nextNorm) return nextNorm
  if (prevNorm.replace(/\n/g, '') !== nextNorm.replace(/\n/g, '')) {
    const prevFlat = prevNorm.replace(/\n/g, '')
    const nextFlat = nextNorm.replace(/\n/g, '')
    if (
      countMemoBodyNewlines(nextNorm) < countMemoBodyNewlines(prevNorm) &&
      nextFlat.startsWith(prevFlat) &&
      nextFlat.length > prevFlat.length &&
      /^:m\/(?:start|arrowright|check|face|music|no|ok|thinking|uncheck):/.test(
        nextFlat.slice(prevFlat.length),
      )
    ) {
      return prevNorm + nextFlat.slice(prevFlat.length)
    }
    return nextNorm
  }
  if (countMemoBodyNewlines(prevNorm) > countMemoBodyNewlines(nextNorm)) {
    return prevNorm
  }
  return nextNorm
}
