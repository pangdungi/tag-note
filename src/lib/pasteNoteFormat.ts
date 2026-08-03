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

/** 줄이 말줄임(`..`, `...`, `…`)만 있는지 */
function isEllipsisOnlyLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return /^(\.{2,}|…+)$/.test(t)
}

/** 전자책·웹 복사 시 줄 끝 `..` / `...` / `…` 제거 */
export function stripTrailingPasteEllipsis(text: string): string {
  let t = text
  // 마침표 + 말줄임 (예: `많다....`) → 마침표 하나
  t = t.replace(/\.(\.{2,}|…+)+$/u, '.')
  // 줄 끝 말줄임만 (예: `..`, `...`, `…`)
  t = t.replace(/(\.{2,}|…+)$/u, '')
  return t.trimEnd()
}

/** 교보문고 — 출처 직전 중복 미리보기 줄(…로 끝나고 위 본문과 겹침) 제거 */
function trimKyoboPreviewLinesBeforeSource(
  lines: string[],
  bodyEnd: number,
): number {
  let end = bodyEnd
  while (end > 0) {
    let i = end - 1
    while (i >= 0 && !lines[i]?.trim()) i--
    if (i < 0) break

    const raw = lines[i]!.trim()
    if (isEllipsisOnlyLine(raw)) {
      end = i
      continue
    }

    if (/(\.{2,}|…)\s*$/u.test(raw)) {
      const stripped = stripTrailingPasteEllipsis(raw)
      if (stripped.length >= 8) {
        const bodyAbove = lines.slice(0, i).join('\n')
        const head = stripped.slice(0, Math.min(24, stripped.length))
        if (bodyAbove.includes(head)) {
          end = i
          continue
        }
      }
    }
    break
  }
  return end
}

/** 붙여넣은 메모 본문 — 줄 끝 말줄임 정리, 말줄임만 있는 줄 제거 */
export function cleanPastedMemoText(
  text: string,
  options?: { trimWhole?: boolean },
): string {
  const trimWhole = options?.trimWhole ?? true
  let result = text
    .split('\n')
    .map((line) => stripTrailingPasteEllipsis(line))
    .filter((line) => !isEllipsisOnlyLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
  if (trimWhole) {
    result = result.trim()
  }
  return result
}

/** HTML 클립보드 → 평문 (줄바꿈·공백 그대로) */
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
  return out
}

/** 같은 줄 끝에 붙은 URL 제거 */
function stripInlineUrl(text: string): string {
  return text
    .replace(/\s+https?:\/\/\S+/gi, '')
    .replace(/\s+www\.\S+/gi, '')
    .trim()
}

/**
 * 태그 입력용 — 교보문고 복사(끝 URL·중에서·…)를 제목만 남기고 정리.
 * 예: `성장의 조건 PDCA중에서 https://ebook-product.kyobobook.co.kr/...` → `성장의 조건 PDCA`
 */
export function cleanKyoboPasteForTagLabel(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) return ''

  const hasKyoboFooter =
    /https?:\/\/|kyobobook|ebook-product|yes24|알라딘|교보\s*e?\s*book/i.test(
      text,
    )

  if (!hasKyoboFooter) return text

  const parsed = parseNotePasteWithTrailingUrl(text)
  if (parsed?.source) {
    text = parsed.source
  } else if (parsed?.body) {
    const line = parsed.body.split('\n').find((l) => l.trim())?.trim()
    if (line) text = line
  }

  text = stripInlineUrl(text)
  text = stripTrailingPasteEllipsis(text)
  text = extractSourceTitleFromPasteLine(text)
  return text.trim()
}

/**
 * 끝에 URL이 있는 붙여넣기 텍스트를 본문·출처로 분리.
 * URL·출처 줄·서점 안내 줄만 제거하고 본문은 그대로 둠.
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
  let bodyEnd = sourceLineIdx >= 0 ? sourceLineIdx : urlLineIdx
  bodyEnd = trimKyoboPreviewLinesBeforeSource(lines, bodyEnd)
  const body = cleanPastedMemoText(lines.slice(0, bodyEnd).join('\n'))

  return { body, source }
}
