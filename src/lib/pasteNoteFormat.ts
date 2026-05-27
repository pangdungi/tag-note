import type { ClipboardEvent } from 'react'

/** 마지막 줄(또는 끝) URL + 그 바로 위 줄을 출처로 보는 붙여넣기 포맷 */
export type ParsedNotePaste = {
  body: string
  source: string | null
}

const URL_LINE_RE = /^https?:\/\/\S+/i

function isUrlLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return URL_LINE_RE.test(t) || /^www\.\S+/i.test(t)
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

  let sourceLineIdx = -1
  for (let i = urlLineIdx - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (!t) continue
    sourceLineIdx = i
    break
  }

  const source =
    sourceLineIdx >= 0 ? lines[sourceLineIdx].trim() : null
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
  const glueBefore = before.length > 0 && parsed.body && !before.endsWith('\n') ? '\n\n' : ''
  const glueAfter = after.length > 0 && parsed.body && !after.startsWith('\n') ? '\n\n' : ''
  const newBody = cleanPastedMemoText(
    `${before}${glueBefore}${parsed.body}${glueAfter}${after}`,
  )

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
  const glueBefore =
    before.length > 0 && cleaned && !before.endsWith('\n') ? '\n\n' : ''
  const glueAfter =
    after.length > 0 && cleaned && !after.startsWith('\n') ? '\n\n' : ''
  setBody(cleanPastedMemoText(`${before}${glueBefore}${cleaned}${glueAfter}${after}`))
}
