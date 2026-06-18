import type { ClipboardEvent } from 'react'

/** 마지막 줄(또는 끝) URL + 그 바로 위 줄을 출처로 보는 붙여넣기 포맷 */
export type ParsedNotePaste = {
  body: string
  source: string | null
}

const URL_LINE_RE = /^https?:\/\/\S+/i

/** 출처로 쓰지 않을 전자책·서점 안내 줄 */
const SOURCE_NOISE_RES = [
  /교보\s*e?\s*book/i,
  /kyobobook/i,
  /자세히\s*보기/i,
  /ebook-product\./i,
  /yes24/i,
  /알라딘/i,
]

function isUrlLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return URL_LINE_RE.test(t) || /^www\.\S+/i.test(t)
}

function isSourceNoiseLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (isUrlLine(t)) return true
  return SOURCE_NOISE_RES.some((re) => re.test(t))
}

/** `"책제목"중에서` 등 → 책 제목만 */
export function extractSourceTitleFromPasteLine(line: string): string {
  let t = line.trim()
  const quoted = t.match(
    /^[「"'『]\s*(.+?)\s*[」"'』]\s*(?:중에서|에서)?\s*$/u,
  )
  if (quoted) return quoted[1].trim()

  const quotedMid = t.match(/^[「"'『]\s*(.+?)\s*[」"'』]\s*중에서/u)
  if (quotedMid) return quotedMid[1].trim()

  t = t.replace(/\s*중에서\s*$/u, '').trim()
  t = t.replace(/^[「"'『]\s*/, '').replace(/\s*[」"'』]$/, '')
  return t.trim()
}

function findSourceLineIdx(lines: string[], urlLineIdx: number): number {
  for (let i = urlLineIdx - 1; i >= 0; i--) {
    if (isSourceNoiseLine(lines[i])) continue
    return i
  }
  return -1
}

/** 전자책·웹 복사 시 붙는 끝 `...` / `…` 제거 */
export function stripTrailingPasteEllipsis(text: string): string {
  let t = text
  // 마침표 + 말줄임 (예: `많다....`) → 마침표 하나
  t = t.replace(/\.(\.{3,}|…+)+$/u, '.')
  // 줄 끝 말줄임만 (예: `...`, `…`)
  t = t.replace(/(\.{3,}|…+)$/u, '')
  return t.trimEnd()
}

/** HTML 클립보드 → 평문 (목록은 `• ` 줄로 — 이후 uncheck 아이콘으로 변환) */
export function clipboardHtmlToPlainMemoText(html: string): string {
  if (!html.trim()) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let out = ''

  function ensureLineBreak(): void {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n'
  }

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName

    if (tag === 'BR') {
      out += '\n'
      return
    }
    if (tag === 'LI') {
      ensureLineBreak()
      out += '• '
      for (const child of el.childNodes) walk(child)
      return
    }
    if (tag === 'UL' || tag === 'OL') {
      for (const child of el.childNodes) walk(child)
      return
    }
    if (
      (tag === 'P' || tag === 'DIV') &&
      (el.parentElement === doc.body || el.parentElement?.tagName === 'BODY')
    ) {
      ensureLineBreak()
      for (const child of el.childNodes) walk(child)
      out += '\n'
      return
    }
    for (const child of el.childNodes) walk(child)
  }

  for (const child of doc.body.childNodes) walk(child)
  return out.replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** 붙여넣은 메모 본문 — 각 줄 끝 말줄임 정리 */
export function cleanPastedMemoText(text: string): string {
  return text
    .split('\n')
    .map((line) => stripTrailingPasteEllipsis(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 끝에 URL이 있는 붙여넣기 텍스트를 본문·출처로 분리.
 * URL 직전 비어 있지 않은 줄 → 출처, 그 위 → 본문. URL은 제거.
 */
export function parseNotePasteWithTrailingUrl(
  raw: string,
): ParsedNotePaste | null {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return null

  const lines = normalized.split('\n')

  let urlLineIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (!t) continue
    if (isUrlLine(t)) urlLineIdx = i
    break
  }
  if (urlLineIdx === -1) return null

  const sourceLineIdx = findSourceLineIdx(lines, urlLineIdx)

  const sourceRaw =
    sourceLineIdx >= 0
      ? extractSourceTitleFromPasteLine(lines[sourceLineIdx].trim())
      : null
  const source = sourceRaw && sourceRaw.length > 0 ? sourceRaw : null
  const bodyEnd = sourceLineIdx >= 0 ? sourceLineIdx : urlLineIdx
  const body = cleanPastedMemoText(
    lines
      .slice(0, bodyEnd)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )

  return { body, source }
}

export function applyStructuredNotePaste(
  currentBody: string,
  currentSource: string,
  pastedText: string,
  selectionStart: number,
  selectionEnd: number,
): { body: string; source: string; handled: boolean } {
  const parsed = parseNotePasteWithTrailingUrl(pastedText)
  if (!parsed) {
    return { body: currentBody, source: currentSource, handled: false }
  }

  const before = currentBody.slice(0, selectionStart)
  const after = currentBody.slice(selectionEnd)
  const newBody = cleanPastedMemoText(`${before}${parsed.body}${after}`)

  let newSource = currentSource
  if (parsed.source) {
    newSource = parsed.source
  }

  return { body: newBody, source: newSource, handled: true }
}

export function onStructuredNoteBodyPaste(
  e: ClipboardEvent<HTMLTextAreaElement>,
  body: string,
  source: string,
  setBody: (value: string) => void,
  setSource: (value: string) => void,
): void {
  const pasted = e.clipboardData.getData('text/plain')
  const { selectionStart, selectionEnd } = e.currentTarget
  const result = applyStructuredNotePaste(
    body,
    source,
    pasted,
    selectionStart,
    selectionEnd,
  )
  if (result.handled) {
    e.preventDefault()
    setBody(result.body)
    setSource(result.source)
    return
  }

  const cleaned = cleanPastedMemoText(pasted)
  if (cleaned === pasted) return

  e.preventDefault()
  const before = body.slice(0, selectionStart)
  const after = body.slice(selectionEnd)
  setBody(cleanPastedMemoText(`${before}${cleaned}${after}`))
}
