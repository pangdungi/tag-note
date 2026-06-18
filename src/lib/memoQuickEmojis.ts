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
function appendMemoSegmentsToFragment(
  frag: DocumentFragment,
  text: string,
): Node | null {
  let last: Node | null = null
  const segments = parseMemoBody(text)
  for (const seg of segments) {
    if (seg.type === 'text') {
      if (!seg.value) continue
      last = document.createTextNode(seg.value)
      frag.appendChild(last)
      continue
    }
    const img = createMemoEmojiImg(seg.emoji)
    frag.appendChild(img)
    const caret = document.createTextNode(MEMO_EDITOR_ZWSP)
    frag.appendChild(caret)
    last = caret
  }
  return last
}

/** 입력·붙여넣기 텍스트의 유니코드/토큰 → 바와 같은 img */
export function normalizeQuickEmojisInEditor(root: HTMLElement): boolean {
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = stripEditorZwsp(node.textContent ?? '')
    if (text && textHasQuickEmojiMarkup(text)) {
      textNodes.push(node as Text)
    }
  }

  if (textNodes.length === 0) return false

  for (const textNode of textNodes) {
    const raw = textNode.textContent ?? ''
    const text = stripEditorZwsp(raw)
    if (!text || !textHasQuickEmojiMarkup(text)) continue

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
  const normalized = normalizeMemoBodyStorage(body)
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

    if (el.tagName === 'LI') {
      if (out.length > 0 && !out.endsWith('\n')) {
        out += '\n'
      }
      for (const child of el.childNodes) {
        walk(child)
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
      if (isCaretOnlyBlock(el)) {
        out += '\n'
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
      (el.tagName === 'DIV' || el.tagName === 'P') &&
      el.parentElement === root
    ) {
      if (isCaretOnlyBlock(el)) {
        if (pos + 1 >= target) {
          markFound(el, 0)
          return
        }
        pos += 1
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

  const img = createMemoEmojiImg(emoji)

  const caret = document.createTextNode(MEMO_EDITOR_ZWSP)
  range.insertNode(caret)
  range.insertNode(img)
  range.setStart(caret, 1)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

/** 저장된 본문 정리 — 줄바꿈은 유지 */
export function normalizeMemoBodyStorage(body: string): string {
  return body.replace(/:m\/enter:/g, '').replace(/\n{3,}/g, '\n\n')
}
