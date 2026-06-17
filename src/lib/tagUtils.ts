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

/** 태그 뷰·검색 — 세로 스파인 (#로 상위태그·출처와 구분) */
export function formatTagViewSpineLabel(raw: string): string {
  return formatSpineText(displayTagName(raw))
}

/** 검색 결과 — 일반 태그 스파인 (#로 상위태그와 구분) */
export function formatSearchTagSpineLabel(raw: string): string {
  return formatTagViewSpineLabel(raw)
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
  void links
  return tags
    .filter((t) => t.id !== parentId)
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

/** 다른 상위태그의 하위로 연결된 태그인지 (parent_id 또는 tag_parent_links) */
export function isTagLinkedAsChild(
  tagId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  const tag = tags.find((t) => t.id === tagId)
  if (tag?.parent_id) return true
  return links?.some((l) => l.tag_id === tagId) ?? false
}

export function getParentTags(
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): TagHierarchyRow[] {
  return tags
    .filter((t) => isBooksRailParentTag(t, tags, links))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 책(상위태그) 레일에 올릴 상위 태그 — 하위가 있거나 is_parent로 지정된 태그 */
export function isBooksRailParentTag(
  tag: TagHierarchyRow,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  if (tag.parent_id) return false
  if (isTagLinkedAsChild(tag.id, tags, links)) return false
  return tagHasChildren(tag.id, tags, links) || Boolean(tag.is_parent)
}

/** 태그 뷰 레일 — 「태그 없음」 가상 항목 id */
export const TAG_VIEW_NONE_ID = '__tag_view_none__'

/** 태그 뷰 「태그 없음」 — note_tags에 연결된 태그가 하나도 없는 메모 */
export function noteHasNoTagViewTags(
  note: {
    note_tags: { tag_id: string; tags?: { id: string } | null }[]
  },
): boolean {
  for (const nt of note.note_tags) {
    const id = nt.tags?.id ?? nt.tag_id
    if (id && !id.startsWith('pending-')) return false
  }
  return true
}

export function getIndependentTags(
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): TagHierarchyRow[] {
  return tags
    .filter((t) => !t.parent_id && !isBooksRailParentTag(t, tags, links))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 태그 뷰 레일 — 지정된 하위태그·하위가 있는 상위태그는 제외, 솔로 상위태그는 포함 */
export function getTagsForTagViewRail(
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): TagHierarchyRow[] {
  return tags
    .filter((t) => {
      if (isTagLinkedAsChild(t.id, tags, links)) return false
      if (tagHasChildren(t.id, tags, links)) return false
      return true
    })
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

/** 책 뷰 — 선택된 태그에 대해 메모를 걸러낼 태그 id 목록 (하위 선택 시 상위+하위 교집합) */
export function resolveBooksTagFilterTagIds(
  nav: 'books' | 'tags' | 'links',
  selectedTagId: string,
  booksRailExpandedParentId: string | null,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string[] {
  if (selectedTagId === TAG_VIEW_NONE_ID) return [TAG_VIEW_NONE_ID]
  if (nav !== 'books' || !booksRailExpandedParentId) return [selectedTagId]
  if (selectedTagId === booksRailExpandedParentId) return [selectedTagId]
  if (
    isTagChildOfParent(
      selectedTagId,
      booksRailExpandedParentId,
      tags,
      links,
    )
  ) {
    return [selectedTagId]
  }
  return [selectedTagId]
}

export function noteHasAllTagIds(
  note: {
    note_tags: { tag_id: string; tags?: { id: string } | null }[]
  },
  tagIds: string[],
): boolean {
  const onNote = new Set<string>()
  for (const nt of note.note_tags) {
    const id = nt.tags?.id ?? nt.tag_id
    if (id && !id.startsWith('pending-')) onNote.add(id)
  }
  return tagIds.every((id) => onNote.has(id))
}

export function filterNotesForAllTagIds<
  T extends {
    note_tags: { tag_id: string; tags?: { id: string } | null }[]
    created_at: string
  },
>(
  notes: T[],
  tagIds: string[],
): T[] {
  const ids = [...new Set(tagIds.filter(Boolean))]
  if (ids.length === 0) return []
  if (ids.length === 1) {
    const only = ids[0]!
    return notes
      .filter((n) =>
        n.note_tags.some((nt) => (nt.tags?.id ?? nt.tag_id) === only),
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
  }
  return notes
    .filter((n) => noteHasAllTagIds(n, ids))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
}

/** 메모에 특정 태그 id가 붙었는지 */
export function noteHasTagId(
  note: {
    note_tags: { tag_id: string; tags?: { id: string } | null }[]
  },
  tagId: string,
): boolean {
  return note.note_tags.some(
    (nt) => (nt.tags?.id ?? nt.tag_id) === tagId,
  )
}

/** 상위 태그만 달린 메모 — 해당 상위의 하위 태그는 없음 */
export function filterNotesForParentOnlyUnderParent<
  T extends {
    note_tags: { tag_id: string; tags?: { id: string } | null }[]
    created_at: string
  },
>(
  notes: T[],
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): T[] {
  const childIds = new Set(
    getChildTags(parentId, tags, links).map((c) => c.id),
  )
  return notes
    .filter((n) => {
      if (!noteHasTagId(n, parentId)) return false
      for (const nt of n.note_tags) {
        const id = nt.tags?.id ?? nt.tag_id
        if (id && childIds.has(id)) return false
      }
      return true
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
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

/** 특정 상위 spine 아래에 붙은 하위 태그인지 (parent_id 또는 tag_parent_links) */
export function isTagChildOfParent(
  tagId: string,
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) return false
  if (tag.parent_id === parentId) return true
  return (
    links?.some(
      (l) => l.tag_id === tagId && l.parent_tag_id === parentId,
    ) ?? false
  )
}

/** 책 뷰 — 태그(상위·하위) 선택 시 펼칠 상위 spine id */
export function resolveBooksRailExpandedParentForTag(
  tagId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
  preferredParentId?: string | null,
): string | null {
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) return null
  if (
    preferredParentId &&
    isTagChildOfParent(tagId, preferredParentId, tags, links)
  ) {
    return preferredParentId
  }
  if (tag.parent_id) return tag.parent_id
  const link = links?.find((l) => l.tag_id === tagId)
  if (link) return link.parent_tag_id
  if (isBooksRailParentTag(tag, tags, links)) return tag.id
  return null
}

/** + 메모 추가 시 입력 태그를 붙일 상위태그 (책/태그 뷰에서 상위 선택·펼침 중) */
export function resolveAddNoteParentTagId(
  homeBrowseNav: 'books' | 'tags' | 'links',
  selectedTagId: string | null,
  booksRailExpandedParentId: string | null,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string | null {
  const asParentId = (id: string | null | undefined): string | null => {
    if (!id) return null
    const tag = tags.find((t) => t.id === id)
    if (!tag) return null
    return isBooksRailParentTag(tag, tags, links) ? tag.id : null
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

/** 태그가 어떤 상위태그 아래에 지정된 하위인지 (parent_id 또는 link) */
export function isTagAssignedUnderParent(
  tagId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) return false
  if (tag.parent_id) return true
  return links?.some((l) => l.tag_id === tagId) ?? false
}

/** + 메모 추가 시 태그칩에 미리 넣을 선택 태그 */
export function resolveAddNoteInitialTags(
  selectedTagId: string | null,
  tags: TagHierarchyRow[],
): { id: string; name: string; color_index: number }[] {
  if (!selectedTagId || selectedTagId === TAG_VIEW_NONE_ID) return []
  const tag = tags.find((t) => t.id === selectedTagId)
  if (!tag) return []
  const name = normalizeTagInput(tag.name)
  if (!name) return []
  return [{ id: tag.id, name, color_index: tag.color_index }]
}

export type AddNoteComposeState = {
  initialTags: { id: string; name: string; color_index: number }[]
  lockedParentTagId: string | null
  childTagCompose: boolean
}

/** 책 뷰 + 메모 — 마지막으로 눌린 대상(상위 spine vs 하위 태그) */
export type BooksMemoComposeTarget = 'parent' | 'child'

function tagToAddNoteInitialChip(
  tag: TagHierarchyRow,
): { id: string; name: string; color_index: number } | null {
  const name = normalizeTagInput(tag.name)
  if (!name) return null
  return { id: tag.id, name, color_index: tag.color_index }
}

/** + 메모 추가 — 태그칩·상위 고정·하위 compose 한 번에 결정 */
export function resolveAddNoteComposeState(
  homeBrowseNav: 'books' | 'tags' | 'links',
  selectedTagId: string | null,
  booksRailExpandedParentId: string | null,
  booksMemoComposeTarget: BooksMemoComposeTarget | null,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): AddNoteComposeState {
  const empty: AddNoteComposeState = {
    initialTags: [],
    lockedParentTagId: null,
    childTagCompose: false,
  }

  const asLockedParent = (id: string | null | undefined): string | null => {
    if (!id) return null
    const tag = tags.find((t) => t.id === id)
    if (!tag || !isBooksRailParentTag(tag, tags, links)) return null
    return tag.id
  }

  if (homeBrowseNav === 'books' && booksRailExpandedParentId) {
    const parentId = booksRailExpandedParentId
    if (
      booksMemoComposeTarget === 'child' &&
      selectedTagId &&
      isTagChildOfParent(selectedTagId, parentId, tags, links)
    ) {
      const child = tags.find((t) => t.id === selectedTagId)
      if (!child) return empty
      const chip = tagToAddNoteInitialChip(child)
      if (!chip) return empty
      return {
        initialTags: [chip],
        lockedParentTagId: null,
        childTagCompose: true,
      }
    }
    const locked = asLockedParent(parentId)
    if (!locked) return empty
    return {
      initialTags: [],
      lockedParentTagId: locked,
      childTagCompose: false,
    }
  }

  if (homeBrowseNav === 'books' && selectedTagId) {
    const selected = tags.find((t) => t.id === selectedTagId)
    if (selected && isBooksRailParentTag(selected, tags, links)) {
      return {
        initialTags: [],
        lockedParentTagId: selected.id,
        childTagCompose: false,
      }
    }
  }

  if (
    homeBrowseNav === 'tags' &&
    selectedTagId &&
    selectedTagId !== TAG_VIEW_NONE_ID
  ) {
    const selected = tags.find((t) => t.id === selectedTagId)
    if (!selected) return empty
    if (isBooksRailParentTag(selected, tags, links)) {
      return {
        initialTags: [],
        lockedParentTagId: selected.id,
        childTagCompose: false,
      }
    }
    const chip = tagToAddNoteInitialChip(selected)
    if (!chip) return empty
    if (isTagAssignedUnderParent(selectedTagId, tags, links)) {
      return {
        initialTags: [chip],
        lockedParentTagId: null,
        childTagCompose: true,
      }
    }
    return {
      initialTags: [chip],
      lockedParentTagId: null,
      childTagCompose: false,
    }
  }

  return empty
}

/** + 메모: 상위 A 직접 선택·하위 없이 펼침 → A만(메인). 하위 a 선택 → a만. 미선택 → 태그·상위 지정 UI */
export function resolveAddNoteLockedParentTagId(
  homeBrowseNav: 'books' | 'tags' | 'links',
  selectedTagId: string | null,
  booksRailExpandedParentId: string | null,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string | null {
  const asLockedParent = (id: string | null | undefined): string | null => {
    if (!id) return null
    const tag = tags.find((t) => t.id === id)
    if (!tag || !isBooksRailParentTag(tag, tags, links)) return null
    return tag.id
  }

  if (homeBrowseNav === 'books' && selectedTagId) {
    const selected = tags.find((t) => t.id === selectedTagId)
    if (!selected) return null
    if (!isBooksRailParentTag(selected, tags, links)) {
      return null
    }
    return selected.id
  }

  if (homeBrowseNav === 'tags' && selectedTagId) {
    return asLockedParent(selectedTagId)
  }

  if (
    homeBrowseNav === 'books' &&
    !selectedTagId &&
    booksRailExpandedParentId
  ) {
    return asLockedParent(booksRailExpandedParentId)
  }

  return null
}

/** + 메모: 상위 아래 하위 a 선택 → a만 태그칩(상위 A는 메모 태그에 넣지 않음) */
export function isChildTagAddNoteCompose(
  selectedTagId: string | null,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  if (!selectedTagId || selectedTagId === TAG_VIEW_NONE_ID) return false
  const tag = tags.find((t) => t.id === selectedTagId)
  if (!tag || isBooksRailParentTag(tag, tags, links)) return false
  return isTagAssignedUnderParent(selectedTagId, tags, links)
}

/** 메모 수정 — 상위태그 spine에서 상위 자체를 눌러 본 맥락만 고정 */
export function resolveLockedParentTagIdForNoteModal(
  contextTagId: string | null | undefined,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string | null {
  if (!contextTagId || contextTagId === TAG_VIEW_NONE_ID) return null
  const tag = tags.find((t) => t.id === contextTagId)
  if (!tag) return null
  if (isBooksRailParentTag(tag, tags, links)) return tag.id
  return null
}

/** 메모 태그·선택 태그에서 공통 상위태그 추론 */
export function inferParentTagIdFromTagIds(
  tagIds: string[],
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string {
  const parents = new Set<string>()
  for (const id of tagIds) {
    if (!id) continue
    const tag = tags.find((t) => t.id === id)
    if (tag?.parent_id) parents.add(tag.parent_id)
    for (const l of links ?? []) {
      if (l.tag_id === id) parents.add(l.parent_tag_id)
    }
  }
  if (parents.size === 1) return [...parents][0]
  return ''
}

/** 상위태그 아래로 편입할 태그 id (상위·다른 상위태그 제외) */
export function tagIdsForParentAssignment(
  tagIds: string[],
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): string[] {
  return tagIds.filter((id) => {
    if (!id || id === parentId) return false
    const tag = tags.find((t) => t.id === id)
    if (!tag) return false
    if (isBooksRailParentTag(tag, tags, links)) return false
    return true
  })
}

/** 상위 태그로 쓸 수 있는 후보 (상위태그만, 자기 자신 제외) */
export function getParentTagCandidates(
  tag: TagHierarchyRow,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): TagHierarchyRow[] {
  return tags
    .filter((t) => t.id !== tag.id && isBooksRailParentTag(t, tags, links))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function canAssignTagToParent(
  tag: TagHierarchyRow,
  parentId: string,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  void tags
  void links
  if (tag.id === parentId) return false
  return true
}

/** 독립 태그 → 상위태그(책) 승격 가능 여부 */
export function canPromoteTagToParent(
  tag: TagHierarchyRow,
  tags: TagHierarchyRow[],
  links?: TagParentLink[],
): boolean {
  if (tagHasChildren(tag.id, tags, links)) return false
  if (isBooksRailParentTag(tag, tags, links)) return false
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
