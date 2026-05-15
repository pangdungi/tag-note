/** 입력에서 # 접두사 제거, 앞뒤 공백 */
export function normalizeTagInput(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('#')) return t.slice(1).trim()
  return t
}

export function displayTagName(storedName: string): string {
  return storedName.startsWith('#') ? storedName : `#${storedName}`
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length
  const n = b.length
  const row = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const cur = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = cur
    }
  }
  return row[n]!
}

/** 비슷한 단어는 같은 색 그룹으로 묶기 위한 판별 */
export function tagsAreSimilar(a: string, b: string): boolean {
  const x = normalizeTagInput(a).toLowerCase()
  const y = normalizeTagInput(b).toLowerCase()
  if (x === y) return true
  if (x.length === 0 || y.length === 0) return false
  if (x.includes(y) || y.includes(x)) return true

  const maxLen = Math.max(x.length, y.length)
  const dist = levenshtein(x, y)
  if (maxLen <= 5 && dist <= 1) return true
  if (maxLen <= 10 && dist <= 2) return true
  if (maxLen > 10 && dist <= Math.max(2, Math.floor(maxLen * 0.15))) return true

  let prefix = 0
  const lim = Math.min(x.length, y.length)
  while (prefix < lim && x[prefix] === y[prefix]) prefix++
  if (prefix >= 1 && prefix >= lim * 0.4) return true

  return false
}

export const TAG_COLOR_COUNT = 5

/** 새 태그에만 사용. 0..TAG_COLOR_COUNT-1 톤 중 무작위 배정(이름·유사도와 무관). */
export function pickColorIndex(
  _newName: string,
  _existing: { name: string; color_index: number }[],
): number {
  void _newName
  void _existing
  return Math.floor(Math.random() * TAG_COLOR_COUNT)
}
