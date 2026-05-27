/** 출처 제목 정규화 — 앞뒤 공백·연속 공백 정리 */
export function normalizeSourceTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** 출처 비교용 키 (소문자·공백 통일) */
export function sourceTitleKey(raw: string): string {
  return normalizeSourceTitle(raw).toLowerCase()
}

/** 카드·필터에 표시할 출처 문자열 */
export function displaySourceTitle(title: string): string {
  return normalizeSourceTitle(title)
}
