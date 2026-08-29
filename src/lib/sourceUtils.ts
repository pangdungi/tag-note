import type { SourceRow } from './notesApi'
import { resolveSourceSpineUrl } from './bookCatalogServer'

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

/** 책장에 세웠을 때 높이(mm). 예스24 세로(length) 우선, 없으면 가로. */
export function bookStandingHeightMm(source: {
  book_length_mm?: number | null
  book_width_mm?: number | null
}): number | null {
  const length = source.book_length_mm ?? 0
  const width = source.book_width_mm ?? 0
  if (length > 0) return length
  if (width > 0) return width
  return null
}

export const SOURCE_CATEGORY_UNCategorized = '분류 없음'

/** 예스24 국내도서 분야 (수동 등록·분류 선택) */
export const SOURCE_CATEGORY_OPTIONS = [
  SOURCE_CATEGORY_UNCategorized,
  '가정 살림',
  '건강 취미',
  '경제 경영',
  '국어 외국어 사전',
  '대학교재',
  '만화/라이트노벨',
  '사회 정치',
  '소설/시/희곡',
  '수험서 자격증',
  '어린이',
  '에세이',
  '여행',
  '역사',
  '예술',
  '유아',
  '인문',
  '인물',
  '자기계발',
  '자연과학',
  '잡지',
  '전집',
  '종교',
  '청소년',
  'IT 모바일',
  '초등참고서',
  '중등참고서',
  '고등참고서',
] as const

export type SourceCategoryOption = (typeof SOURCE_CATEGORY_OPTIONS)[number]

export function normalizeSourceCategory(
  raw?: string | null,
): string | null {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed || trimmed === SOURCE_CATEGORY_UNCategorized) return null
  return trimmed
}

export type SourceCategoryShelf = {
  categoryKey: string
  category: string
  sources: SourceRow[]
}

export type LinksViewMode = 'all' | 'category'

/** 출처 전체 보기 — 북스파인 이미지가 있는 도서를 먼저, 같은 그룹은 제목순 */
export function sortSourcesForAllLinksView(sources: SourceRow[]): SourceRow[] {
  return [...sources].sort((a, b) => {
    const aHasSpine = Boolean(resolveSourceSpineUrl(a))
    const bHasSpine = Boolean(resolveSourceSpineUrl(b))
    if (aHasSpine !== bHasSpine) return aHasSpine ? -1 : 1
    return a.title.localeCompare(b.title, 'ko')
  })
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
