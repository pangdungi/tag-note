export type TagHierarchyRow = {
  id: string
  name: string
  color_index: number
  parent_id?: string | null
  is_parent?: boolean
}

export type TagParentLink = {
  tag_id: string
  parent_tag_id: string
}

/** 입력에서 # 접두사 제거, 앞뒤 공백 */
export function normalizeTagInput(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('#')) return t.slice(1).trim()
  return t
}

export function displayTagName(storedName: string): string {
  return storedName.startsWith('#') ? storedName : `#${storedName}`
}

/** 세로 북스파인 — 괄호·부등호 제거 (세로 표시 불편) */
export function formatSpineText(text: string): string {
  return text
    .replace(/[()（）<>〈〉]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatSpineLabel(raw: string): string {
  return formatSpineText(normalizeTagInput(raw))
}

/** 검색 결과 — 일반 태그 스파인 (#로 상위태그와 구분) */
export function formatSearchTagSpineLabel(raw: string): string {
  return formatSpineText(displayTagName(raw))
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

export const TAG_COLOR_COUNT = 30

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Supabase에 저장된 태그 id인지 (로컬 미리보기 `pending-…` 제외). */
export function isPersistedTagId(id: string | undefined | null): boolean {
  if (!id || id.startsWith('pending-')) return false
  return UUID_RE.test(id)
}

/** @deprecated 태그 컬러 미사용 — DB 호환용 0 고정 */
export function pickColorIndex(
  _newName: string,
  _existing: { name: string; color_index: number }[],
): number {
  void _newName
  void _existing
  return 0
}

export function tagHasChildren(
  tagId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  if (tags.some((t) => t.parent_id === tagId)) return true
  if (links?.some((l) => l.parent_tag_id === tagId)) return true
  return false
}

export function getChildTags(
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): TagHierarchyRow[] {
  const childIds = new Set<string>()
  for (const t of tags) {
    if (t.parent_id === parentId) childIds.add(t.id)
  }
  if (links) {
    for (const l of links) {
      if (l.parent_tag_id === parentId) childIds.add(l.tag_id)
    }
  }
  return tags
    .filter((t) => childIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 상위태그에 넣을 수 있는 태그 후보 */
export function getChildTagPickCandidates(
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): TagHierarchyRow[] {
  return tags
    .filter((t) => {
      if (t.id === parentId) return false
      if (tagHasChildren(t.id, tags, links)) return false
      if (isBooksRailParentTag(t, tags)) return false
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 하위 태그 선택을 로컬 태그·링크 상태에 즉시 반영 (낙관적 UI) */
export function applyParentChildrenSelection(
  parentId: string,
  childIds: string[],
  tags: TagHierarchyRow[],
  links: TagParentLink[],
): { tags: TagHierarchyRow[]; links: TagParentLink[] } {
  const desired = new Set(childIds.filter(Boolean))

  let nextLinks = links.filter(
    (l) => l.parent_tag_id !== parentId || desired.has(l.tag_id),
  )
  for (const id of desired) {
    if (
      !nextLinks.some(
        (l) => l.tag_id === id && l.parent_tag_id === parentId,
      )
    ) {
      nextLinks = [...nextLinks, { tag_id: id, parent_tag_id: parentId }]
    }
  }

  const nextTags = tags.map((t) => {
    if (t.parent_id === parentId && !desired.has(t.id)) {
      return { ...t, parent_id: null }
    }
    if (desired.has(t.id) && !t.parent_id) {
      return { ...t, parent_id: parentId }
    }
    return t
  })

  return { tags: nextTags, links: nextLinks }
}

/** 기존 하위에 태그를 추가할 때 로컬 상태 즉시 반영 */
export function applyTagsAddedToParent(
  parentId: string,
  addedIds: string[],
  tags: TagHierarchyRow[],
  links: TagParentLink[],
  newTag?: TagHierarchyRow,
): { tags: TagHierarchyRow[]; links: TagParentLink[] } {
  let nextTags = tags
  if (newTag && !tags.some((t) => t.id === newTag.id)) {
    nextTags = [...tags, newTag]
  }
  const currentChildIds = getChildTags(parentId, nextTags, links).map((c) => c.id)
  const mergedIds = [
    ...new Set([
      ...currentChildIds,
      ...addedIds.filter(Boolean),
      ...(newTag ? [newTag.id] : []),
    ]),
  ]
  return applyParentChildrenSelection(parentId, mergedIds, nextTags, links)
}

export function getParentTags(tags: TagHierarchyRow[]): TagHierarchyRow[] {
  return tags
    .filter((t) => isBooksRailParentTag(t, tags))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 책(상위태그) 레일에 올릴 상위 태그 — 하위가 있거나 is_parent로 지정된 태그 */
export function isBooksRailParentTag(
  tag: TagHierarchyRow,
  tags: TagHierarchyRow[],
): boolean {
  if (tag.parent_id) return false
  return tagHasChildren(tag.id, tags) || Boolean(tag.is_parent)
}

export function getIndependentTags(tags: TagHierarchyRow[]): TagHierarchyRow[] {
  return tags
    .filter((t) => !t.parent_id && !isBooksRailParentTag(t, tags))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function resolveTagFilterIds(
  selectedTagId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string[] {
  if (tagHasChildren(selectedTagId, tags, links)) {
    return [
      selectedTagId,
      ...getChildTags(selectedTagId, tags, links).map((t) => t.id),
    ]
  }
  return [selectedTagId]
}

export function isParentTagRailActive(
  parentTagId: string,
  selectedTagId: string | null,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  if (!selectedTagId) return false
  if (parentTagId === selectedTagId) return true
  const selected = tags.find((t) => t.id === selectedTagId)
  if (selected?.parent_id === parentTagId) return true
  if (
    links?.some(
      (l) => l.tag_id === selectedTagId && l.parent_tag_id === parentTagId,
    )
  ) {
    return true
  }
  return false
}

/** + 메모 추가 시 입력 태그를 붙일 상위태그 (책/태그 뷰에서 상위 선택·펼침 중) */
export function resolveAddNoteParentTagId(
  homeBrowseNav: 'books' | 'tags' | 'links',
  selectedTagId: string | null,
  booksRailExpandedParentId: string | null,
  tags: TagHierarchyRow[],
): string | null {
  const asParentId = (id: string | null | undefined): string | null => {
    if (!id) return null
    const tag = tags.find((t) => t.id === id)
    if (!tag) return null
    return isBooksRailParentTag(tag, tags) ? tag.id : null
  }

  if (homeBrowseNav === 'books') {
    const fromExpanded = asParentId(booksRailExpandedParentId)
    if (fromExpanded) return fromExpanded
    if (selectedTagId) {
      const selected = tags.find((t) => t.id === selectedTagId)
      if (selected?.parent_id) return selected.parent_id
      return asParentId(selectedTagId)
    }
  }

  if (homeBrowseNav === 'tags' && selectedTagId) {
    const selected = tags.find((t) => t.id === selectedTagId)
    if (selected?.parent_id) return selected.parent_id
    return asParentId(selectedTagId)
  }

  return null
}

/** 상위 태그로 쓸 수 있는 후보 (상위태그만, 자기 자신 제외) */
export function getParentTagCandidates(
  tag: TagHierarchyRow,
  tags: TagHierarchyRow[],
): TagHierarchyRow[] {
  if (tagHasChildren(tag.id, tags)) return []
  return tags
    .filter((t) => t.id !== tag.id && isBooksRailParentTag(t, tags))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function canAssignTagToParent(
  tag: TagHierarchyRow,
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  if (tag.id === parentId) return false
  if (tagHasChildren(tag.id, tags, links)) return false
  if (isBooksRailParentTag(tag, tags)) return false
  return true
}

/** 독립 태그 → 상위태그(책) 승격 가능 여부 */
export function canPromoteTagToParent(
  tag: TagHierarchyRow,
  tags: TagHierarchyRow[],
): boolean {
  if (tagHasChildren(tag.id, tags)) return false
  if (isBooksRailParentTag(tag, tags)) return false
  return true
}

const HANGUL_CHO = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const

const CHO_TO_INDEX: Record<string, string> = {
  'ㄲ': 'ㄱ',
  'ㄸ': 'ㄷ',
  'ㅃ': 'ㅂ',
  'ㅆ': 'ㅅ',
  'ㅉ': 'ㅈ',
}

export const TAG_RAIL_INDEX_ETC = ['#'] as const

export const TAG_RAIL_INDEX_KO = [
  'ㄱ',
  'ㄴ',
  'ㄷ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅅ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const

export const TAG_RAIL_INDEX_EN = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
] as const

/** 레일 정렬(localeCompare ko)과 동일 — 숫자·기호 → 한글 → 영문 */
export const TAG_RAIL_INDEX_ORDER = [
  ...TAG_RAIL_INDEX_ETC,
  ...TAG_RAIL_INDEX_KO,
  ...TAG_RAIL_INDEX_EN,
] as const

export type TagRailIndexKey = (typeof TAG_RAIL_INDEX_ORDER)[number]

/** 태그 이름 첫 글자 기준 레일 인덱스 키 (한글 초성·영문·기타) */
export function tagRailIndexKey(storedName: string): TagRailIndexKey {
  const name = normalizeTagInput(storedName)
  const first = [...name][0]
  if (!first) return '#'

  const code = first.codePointAt(0)
  if (code !== undefined && code >= 0xac00 && code <= 0xd7a3) {
    const choIndex = Math.floor((code - 0xac00) / 588)
    const cho = HANGUL_CHO[choIndex] ?? 'ㄱ'
    return (CHO_TO_INDEX[cho] ?? cho) as TagRailIndexKey
  }

  if (/[a-zA-Z]/.test(first)) {
    return first.toUpperCase() as TagRailIndexKey
  }

  if (/[0-9]/.test(first)) {
    return '#'
  }

  return '#'
}

export function tagRailIndexLabel(key: TagRailIndexKey): string {
  return key === '#' ? '0-9' : key
}

export function tagRailIndexHasTags(
  tags: readonly { name: string }[],
  key: TagRailIndexKey,
): boolean {
  return tags.some((tag) => tagRailIndexKey(tag.name) === key)
}

/** 태그 목록에 실제로 존재하는 인덱스 키 (0-9 → ㄱ→ㅎ → A→Z 순) */
export function buildTagRailIndexKeys(
  tags: readonly { name: string }[],
): TagRailIndexKey[] {
  const present = new Set<TagRailIndexKey>()
  for (const tag of tags) {
    present.add(tagRailIndexKey(tag.name))
  }
  return TAG_RAIL_INDEX_ORDER.filter((key) => present.has(key))
}

export function firstTagIdForRailIndexKey(
  tags: readonly { id: string; name: string }[],
  key: TagRailIndexKey,
): string | null {
  return tags.find((tag) => tagRailIndexKey(tag.name) === key)?.id ?? null
}
