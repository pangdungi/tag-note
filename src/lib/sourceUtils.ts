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

import type { SourceRow } from './notesApi'

export const SOURCE_CATEGORY_UNCategorized = '분류 없음'

export type SourceCategoryShelf = {
  categoryKey: string
  category: string
  sources: SourceRow[]
}

/** 출처 목록을 예스24 분야(category)별 책장으로 묶는다 */
export function groupSourcesByCategory(sources: SourceRow[]): SourceCategoryShelf[] {
  const map = new Map<string, SourceCategoryShelf['sources']>()
  for (const source of sources) {
    const category = source.category?.trim() || SOURCE_CATEGORY_UNCategorized
    const list = map.get(category) ?? []
    list.push(source)
    map.set(category, list)
  }

  const shelves = [...map.entries()].map(([category, items]) => ({
    categoryKey: category,
    category,
    sources: [...items].sort((a, b) =>
      a.title.localeCompare(b.title, 'ko'),
    ),
  }))

  shelves.sort((a, b) => {
    if (a.category === SOURCE_CATEGORY_UNCategorized) return 1
    if (b.category === SOURCE_CATEGORY_UNCategorized) return -1
    return a.category.localeCompare(b.category, 'ko')
  })

  return shelves
}
