import arrowrightIcon from '../assets/memo-emojis/arrowright.svg'
import bookIcon from '../assets/memo-emojis/book.svg'
import checkIcon from '../assets/memo-emojis/check.svg'
import lightbulbIcon from '../assets/memo-emojis/lightbulb.svg'
import musicIcon from '../assets/memo-emojis/music.svg'
import noIcon from '../assets/memo-emojis/no.svg'
import okIcon from '../assets/memo-emojis/ok.svg'
import thinkingIcon from '../assets/memo-emojis/thinking.png'
import uncheckIcon from '../assets/memo-emojis/uncheck.svg'

export type MemoQuickEmoji = {
  id: string
  label: string
  iconSrc: string
  /** 예전에 유니코드로 저장된 메모 호환 */
  legacyUnicode?: string
}

export const MEMO_QUICK_EMOJIS: MemoQuickEmoji[] = [
  {
    id: 'lightbulb',
    label: '아이디어',
    iconSrc: lightbulbIcon,
    legacyUnicode: '💡',
  },
  {
    id: 'arrowright',
    label: '가리키기',
    iconSrc: arrowrightIcon,
    legacyUnicode: '👉🏻',
  },
  {
    id: 'pencil',
    label: '생각',
    iconSrc: thinkingIcon,
    legacyUnicode: '💭',
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
  { id: 'no', label: '거절', iconSrc: noIcon, legacyUnicode: '❌' },
  { id: 'ok', label: '동그라미', iconSrc: okIcon, legacyUnicode: '⭕️' },
  { id: 'music', label: '음악', iconSrc: musicIcon, legacyUnicode: '🎧' },
  { id: 'book', label: '책', iconSrc: bookIcon, legacyUnicode: '📘' },
]

const MEMO_EMOJI_BY_ID = new Map(MEMO_QUICK_EMOJIS.map((e) => [e.id, e]))

const MEMO_EMOJI_IDS = MEMO_QUICK_EMOJIS.map((e) => e.id).join('|')

/** 커서용 — 직렬화 시 제거 */
export const MEMO_EDITOR_ZWSP = '\u200B'

/** DB에 저장되는 짧은 토큰 — 예: :m/lightbulb: */
export const MEMO_EMOJI_TOKEN_RE = new RegExp(
  `:m\\/(${MEMO_EMOJI_IDS}):`,
  'g',
)

export function memoEmojiToken(id: string): string {
  return `:m/${id}:`
}

/** 입력 `->` 등을 고정 아이콘 토큰으로 치환 */
const MEMO_TEXT_SHORTCUTS: { pattern: RegExp; id: string }[] = [
  { pattern: /->/g, id: 'arrowright' },
]

export function applyMemoTextShortcuts(body: string): string {
  let result = body
  for (const { pattern, id } of MEMO_TEXT_SHORTCUTS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, memoEmojiToken(id))
  }
  return result
}

export function memoEmojiById(id: string): MemoQuickEmoji | undefined {
  return MEMO_EMOJI_BY_ID.get(id)
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

/** `->` 입력 직후 커서 앞 문자열을 화살표 아이콘으로 치환 */
export function applyMemoTextShortcutsInEditor(root: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return false
  }

  const range = sel.getRangeAt(0)
  if (!range.collapsed || !root.contains(range.startContainer)) {
    return false
  }

  const { startContainer, startOffset } = range
  if (startContainer.nodeType !== Node.TEXT_NODE) {
    return false
  }

  const textNode = startContainer as Text
  const raw = textNode.textContent ?? ''
  if (startOffset < 2 || raw.slice(startOffset - 2, startOffset) !== '->') {
    return false
  }

  const deleteRange = document.createRange()
  deleteRange.setStart(textNode, startOffset - 2)
  deleteRange.setEnd(textNode, startOffset)
  deleteRange.deleteContents()

  sel.removeAllRanges()
  sel.addRange(deleteRange)

  return insertMemoEmojiInEditor(root, 'arrowright')
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
  if (sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
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
    .replace(
      new RegExp(`(:m\\/(${MEMO_EMOJI_IDS}):)\\n+(?!\\n)`, 'g'),
      '$1',
    )
    .replace(/\n{3,}/g, '\n\n')
}
