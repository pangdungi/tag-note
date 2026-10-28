import type { BookshelfRow, SourceRow } from './notesApi'
import {
  hasStoredSourceSpine,
  resolveSourceSpineUrl,
} from './bookCatalogServer'

/** 출처 제목 정규화 — 앞뒤 공백·연속 공백 정리 */
export function normalizeSourceTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** 출처 비교용 키 (소문자·공백 통일) */
export function sourceTitleKey(raw: string): string {
  return normalizeSourceTitle(raw).toLowerCase()
}

export function sourceHasIsbn(source: { isbn?: string | null }): boolean {
  return Boolean(source.isbn?.trim())
}

/** 제목만 있고 ISBN이 없는 출처 — 검색 추가로 표지를 입힐 대상 */
export function findTitleOnlySourceByTitle<
  T extends { title: string; isbn?: string | null },
>(sources: T[], title: string): T | null {
  const key = sourceTitleKey(title)
  return (
    sources.find((s) => sourceTitleKey(s.title) === key && !sourceHasIsbn(s)) ??
    null
  )
}

export function findSourceByIsbn<T extends { isbn?: string | null }>(
  sources: T[],
  isbn: string,
): T | null {
  const id = isbn.trim()
  if (!id) return null
  return sources.find((s) => (s.isbn ?? '').trim() === id) ?? null
}

/** 카드·필터에 표시할 출처 문자열 */
export function displaySourceTitle(title: string): string {
  return normalizeSourceTitle(title)
}

export const SOURCE_REVIEW_MAX = 800

export function normalizeSourceRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  return n
}

export function normalizeSourceReview(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, SOURCE_REVIEW_MAX)
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

/** 이미지 없는 텍스트 북스파인 — 6자까지 기본 높이, 7자부터 제목에 맞춤 */
export const DEFAULT_TEXT_SPINE_FILL = 0.5
export const MIN_TEXT_SPINE_FILL = 0.5
const TEXT_SPINE_GROW_FROM = 7
const TEXT_SPINE_PER_CHAR = 0.05

export function spineTitleCharCount(title: string): number {
  return [...displaySourceTitle(title).replace(/[()（）<>〈〉\s]/g, '')].length
}

export function textSpineFillRatio(title: string): number {
  const n = spineTitleCharCount(title)
  if (n < TEXT_SPINE_GROW_FROM) return DEFAULT_TEXT_SPINE_FILL
  return Math.min(1, DEFAULT_TEXT_SPINE_FILL + (n - 6) * TEXT_SPINE_PER_CHAR)
}

/** 책 뷰 북스파인 — 출처 없는 메모를 모은 가상 항목 id */
export const SOURCE_VIEW_NONE_ID = '__source_view_none__'

/** 책등·시트 제목. 메모 메타의 「출처 없음」과 맞춤 */
export const SOURCE_VIEW_NONE_TITLE = '출처없음'

export function isSourceViewNoneId(id: string | null | undefined): boolean {
  return id === SOURCE_VIEW_NONE_ID
}

/** 분류·개인 뷰 맨 앞 — 인생책으로 표시한 출처 */
export const SOURCE_LIFE_BOOK_SHELF_KEY = '__life_book__'
export const SOURCE_LIFE_BOOK_SHELF_TITLE = '인생책'

export function isLifeBookShelfKey(key: string | null | undefined): boolean {
  return key === SOURCE_LIFE_BOOK_SHELF_KEY
}

function isLifeBookSource(source: SourceRow): boolean {
  return Boolean(source.is_life_book) && !isSourceViewNoneId(source.id)
}

function sortSourcesForShelfRail(a: SourceRow, b: SourceRow): number {
  const aNone = isSourceViewNoneId(a.id)
  const bNone = isSourceViewNoneId(b.id)
  if (aNone !== bNone) return aNone ? -1 : 1
  return a.title.localeCompare(b.title, 'ko')
}

export function createSourceViewNoneRow(): SourceRow {
  return {
    id: SOURCE_VIEW_NONE_ID,
    title: SOURCE_VIEW_NONE_TITLE,
    bookshelf_id: null,
  }
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

export type LinksViewMode = 'all' | 'category' | 'shelf'

export const SOURCE_SHELF_NONE = '책장 없음'
export const SOURCE_SHELF_NONE_KEY = '__shelf_none__'

/** 출처 전체 보기 — 「출처없음」을 맨 앞, 그다음 북스파인 이미지가 있는 도서, 같은 그룹은 제목순 */
export function sortSourcesForAllLinksView(sources: SourceRow[]): SourceRow[] {
  const none: SourceRow[] = []
  const rest: SourceRow[] = []
  for (const source of sources) {
    if (isSourceViewNoneId(source.id)) none.push(source)
    else rest.push(source)
  }
  rest.sort((a, b) => {
    const aHasSpine =
      hasStoredSourceSpine(a) || Boolean(resolveSourceSpineUrl(a))
    const bHasSpine =
      hasStoredSourceSpine(b) || Boolean(resolveSourceSpineUrl(b))
    if (aHasSpine !== bHasSpine) return aHasSpine ? -1 : 1
    return a.title.localeCompare(b.title, 'ko')
  })
  return [...none, ...rest]
}

/** 출처 목록을 예스24 분야(category)별 책장으로 묶는다 */
export function groupSourcesByCategory(sources: SourceRow[]): SourceCategoryShelf[] {
  const none = sources.filter((source) => isSourceViewNoneId(source.id))
  const lifeBooks: SourceRow[] = []
  const map = new Map<string, SourceCategoryShelf['sources']>()
  for (const source of sources) {
    if (isSourceViewNoneId(source.id)) continue
    if (isLifeBookSource(source)) {
      lifeBooks.push(source)
      continue
    }
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

  if (none.length > 0) {
    const uncIdx = shelves.findIndex(
      (s) => s.category === SOURCE_CATEGORY_UNCategorized,
    )
    if (uncIdx >= 0) {
      const shelf = shelves[uncIdx]
      shelves[uncIdx] = {
        ...shelf,
        sources: [...none, ...shelf.sources].sort(sortSourcesForShelfRail),
      }
    } else {
      shelves.push({
        categoryKey: SOURCE_CATEGORY_UNCategorized,
        category: SOURCE_CATEGORY_UNCategorized,
        sources: [...none],
      })
      shelves.sort((a, b) => {
        if (a.category === SOURCE_CATEGORY_UNCategorized) return 1
        if (b.category === SOURCE_CATEGORY_UNCategorized) return -1
        return a.category.localeCompare(b.category, 'ko')
      })
    }
  }

  if (lifeBooks.length > 0) {
    shelves.unshift({
      categoryKey: SOURCE_LIFE_BOOK_SHELF_KEY,
      category: SOURCE_LIFE_BOOK_SHELF_TITLE,
      sources: [...lifeBooks].sort((a, b) =>
        a.title.localeCompare(b.title, 'ko'),
      ),
    })
  }

  return shelves
}

/** 출처 목록을 사용자가 만든 책장별로 묶는다. 빈 책장도 유지 */
export function groupSourcesByBookshelf(
  sources: SourceRow[],
  shelves: BookshelfRow[],
): SourceCategoryShelf[] {
  const none = sources.filter((source) => isSourceViewNoneId(source.id))
  const lifeBooks: SourceRow[] = []
  const known = new Map(shelves.map((shelf) => [shelf.id, shelf]))
  const assigned = new Map<string, SourceRow[]>()
  const unassigned: SourceRow[] = []

  for (const source of sources) {
    if (isSourceViewNoneId(source.id)) continue
    if (isLifeBookSource(source)) {
      lifeBooks.push(source)
      continue
    }
    const shelfId = source.bookshelf_id?.trim() ?? ''
    if (shelfId && known.has(shelfId)) {
      const list = assigned.get(shelfId) ?? []
      list.push(source)
      assigned.set(shelfId, list)
    } else {
      unassigned.push(source)
    }
  }

  const result: SourceCategoryShelf[] = []

  if (lifeBooks.length > 0) {
    result.push({
      categoryKey: SOURCE_LIFE_BOOK_SHELF_KEY,
      category: SOURCE_LIFE_BOOK_SHELF_TITLE,
      sources: [...lifeBooks].sort((a, b) =>
        a.title.localeCompare(b.title, 'ko'),
      ),
    })
  }

  const ordered = [...shelves].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
  for (const shelf of ordered) {
    const items = assigned.get(shelf.id) ?? []
    result.push({
      categoryKey: shelf.id,
      category: shelf.name,
      sources: [...items].sort((a, b) =>
        a.title.localeCompare(b.title, 'ko'),
      ),
    })
  }

  if (none.length > 0 || unassigned.length > 0) {
    result.push({
      categoryKey: SOURCE_SHELF_NONE_KEY,
      category: SOURCE_SHELF_NONE,
      sources: [...none, ...unassigned].sort(sortSourcesForShelfRail),
    })
  }

  return result
}
