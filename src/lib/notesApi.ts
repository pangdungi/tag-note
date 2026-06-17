import { supabase } from './supabase'
import { normalizeSourceTitle, sourceTitleKey } from './sourceUtils'
import {
  normalizeTagInput,
  pickColorIndex,
  isPersistedTagId,
  noteHasNoTagViewTags,
  tagHasChildren,
  TAG_VIEW_NONE_ID,
  filterNotesForAllTagIds,
} from './tagUtils'

/** Supabase/PostgREST 오류에서 사람이 읽을 메시지 추출 */
export function supabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const o = error as { message?: string; details?: string; hint?: string }
    const parts = [o.message, o.details, o.hint].filter(Boolean)
    if (parts.length > 0) return parts.join(' — ')
  }
  return fallback
}

function ilikePattern(raw: string): string {
  const escaped = raw.replace(/[%_,\\]/g, (c) => `\\${c}`)
  return `%${escaped}%`
}

/** 메모 저장/수정 실패 원인 추적용 (개발자 도구 콘솔) */
function logNoteSaveError(
  op: 'create' | 'update',
  step: string,
  context: Record<string, unknown>,
  error: unknown,
) {
  const err =
    error && typeof error === 'object'
      ? (error as {
          message?: string
          code?: string
          details?: string
          hint?: string
          status?: number
        })
      : null
  console.error(`[태그노트] 메모 ${op} 실패 · ${step}`, {
    ...context,
    errorMessage: err?.message ?? String(error),
    errorCode: err?.code,
    errorDetails: err?.details,
    errorHint: err?.hint,
    errorStatus: err?.status,
    rawError: error,
  })
}

function noteSavePayloadMeta(body: string, source: string, tagNames: string[]) {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  return {
    bodyLength: body.length,
    bodyTrimmedLength: trimmed.length,
    sourceLength: sourceTrim.length,
    tagCount: tagNames.length,
    tagNames,
  }
}

export type TagRow = {
  id: string
  name: string
  color_index: number
  parent_id?: string | null
  is_parent?: boolean
  created_at?: string
}

export type SourceRow = {
  id: string
  title: string
  created_at?: string
}

export type NoteWithTags = {
  id: string
  body: string
  /** denormalized 표시용 (sources.title과 동기) */
  source: string
  source_id: string | null
  sources?: { id: string; title: string } | null
  created_at: string
  note_tags: {
    tag_id: string
    tags: {
      id: string
      name: string
      color_index: number
      parent_id?: string | null
    } | null
  }[]
}

export function noteSourceLabel(note: NoteWithTags): string {
  return (note.sources?.title ?? note.source ?? '').trim()
}

/** 홈 목록 첫 페이지·더보기 */
export const NOTES_LIST_PAGE_SIZE = 50

/** 검색 결과 1회 상한 */
export const NOTES_SEARCH_LIMIT = 50

export type NotesPageResult = {
  notes: NoteWithTags[]
  hasMore: boolean
}

export type NotesSearchResult = {
  notes: NoteWithTags[]
  hasMore: boolean
}

/** 목록·검색 응답 — DB row를 앱 메모 형태로 매핑 */
export function toListPreviewNote(
  row: NoteWithTags & { body?: string },
): NoteWithTags {
  return mapNoteRowFromDb(row as NoteRowDb)
}

type NoteRowDb = {
  id: string
  body: string
  source: string
  source_id?: string | null
  created_at: string
  sources?: { id: string; title: string } | { id: string; title: string }[] | null
  note_tags?: NoteWithTags['note_tags']
}

function mapNoteRowFromDb(row: NoteRowDb): NoteWithTags {
  const joined = Array.isArray(row.sources) ? row.sources[0] : row.sources
  const sourceTitle = joined?.title ?? row.source ?? ''
  return {
    id: row.id,
    body: row.body ?? '',
    source: sourceTitle,
    source_id: row.source_id ?? joined?.id ?? null,
    sources: joined ? { id: joined.id, title: joined.title } : null,
    created_at: row.created_at,
    note_tags: row.note_tags ?? [],
  }
}

function countNoteTagLinks(note: NoteWithTags): number {
  return note.note_tags.filter((nt) => nt.tags?.id ?? nt.tag_id).length
}

function mergeNotePreferringFullTags(
  prev: NoteWithTags,
  next: NoteWithTags,
): NoteWithTags {
  const prevCount = countNoteTagLinks(prev)
  const nextCount = countNoteTagLinks(next)
  const note_tags =
    nextCount >= prevCount ? next.note_tags : prev.note_tags
  return { ...next, note_tags }
}

function sortNotesNewestFirst(rows: NoteWithTags[]): NoteWithTags[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export async function fetchTags(): Promise<TagRow[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color_index, parent_id, is_parent, created_at')
    .order('name')
  if (error) throw error
  return (data ?? []) as TagRow[]
}

export type TagParentLink = {
  tag_id: string
  parent_tag_id: string
}

export async function fetchTagParentLinks(): Promise<TagParentLink[]> {
  const { data, error } = await supabase
    .from('tag_parent_links')
    .select('tag_id, parent_tag_id')
  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      error.message.includes('tag_parent_links')
    ) {
      console.warn(
        '[태그노트] tag_parent_links 테이블 없음 — parent_id만 사용합니다.',
      )
      return []
    }
    throw error
  }
  return (data ?? []) as TagParentLink[]
}

/** 태그별 메모 개수 (note_tags 전체 집계) */
export async function fetchTagMemoCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('note_tags').select('tag_id')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const tagId = (row as { tag_id: string }).tag_id
    if (!tagId) continue
    counts[tagId] = (counts[tagId] ?? 0) + 1
  }
  return counts
}

/** 출처별 연결된 태그 종류 수 (source_id 있는 메모만) */
export async function fetchSourceDistinctTagCounts(): Promise<
  Record<string, number>
> {
  const { data, error } = await supabase
    .from('notes')
    .select('source_id, note_tags ( tag_id )')
    .not('source_id', 'is', null)
  if (error) throw error
  const bySource = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    const sid = (row as { source_id: string | null }).source_id
    if (!sid) continue
    const nts =
      (row as { note_tags?: { tag_id: string }[] }).note_tags ?? []
    let set = bySource.get(sid)
    if (!set) {
      set = new Set()
      bySource.set(sid, set)
    }
    for (const nt of nts) {
      if (nt.tag_id) set.add(nt.tag_id)
    }
  }
  const counts: Record<string, number> = {}
  for (const [sid, set] of bySource) {
    counts[sid] = set.size
  }
  return counts
}

export async function fetchSources(): Promise<SourceRow[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('id, title, created_at')
    .order('title')
  if (error) throw error
  return (data ?? []) as SourceRow[]
}

/** 메모가 1개 이상 연결된 출처만 (고아 출처 제외) */
export async function fetchSourcesInUse(): Promise<SourceRow[]> {
  const { data: noteRows, error: nErr } = await supabase
    .from('notes')
    .select('source_id')
    .not('source_id', 'is', null)
  if (nErr) throw nErr

  const ids = [
    ...new Set(
      (noteRows ?? [])
        .map((r) => (r as { source_id: string }).source_id)
        .filter(Boolean),
    ),
  ]
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('sources')
    .select('id, title, created_at')
    .in('id', ids)
    .order('title')
  if (error) throw error
  return (data ?? []) as SourceRow[]
}

/** notes.source_id가 없는 sources 행 삭제 */
export async function deleteSourceIfOrphan(sourceId: string): Promise<boolean> {
  const { count, error: cErr } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)
  if (cErr) throw cErr
  if ((count ?? 0) > 0) return false

  const { error } = await supabase.from('sources').delete().eq('id', sourceId)
  if (error) throw error
  return true
}

/** 출처 이름 수정 — 연결된 메모의 denormalized source도 함께 갱신 */
export async function updateSourceTitle(
  sourceId: string,
  rawTitle: string,
): Promise<SourceRow> {
  const title = normalizeSourceTitle(rawTitle)
  if (!title) throw new Error('출처 이름이 비었습니다.')

  const { data, error } = await supabase
    .from('sources')
    .update({ title })
    .eq('id', sourceId)
    .select('id, title, created_at')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 출처가 이미 있습니다.')
    }
    throw error
  }

  const { error: noteErr } = await supabase
    .from('notes')
    .update({ source: title })
    .eq('source_id', sourceId)
  if (noteErr) throw noteErr

  return data as SourceRow
}

/**
 * 출처만 삭제 — 태그·메모는 유지하고 연결된 메모에서 출처 정보만 제거.
 */
export async function deleteSourceKeepNotes(sourceId: string): Promise<void> {
  const { data: src, error: srcErr } = await supabase
    .from('sources')
    .select('title')
    .eq('id', sourceId)
    .single()
  if (srcErr) throw srcErr

  const key = sourceTitleKey((src as { title: string }).title)

  const { error: linkedErr } = await supabase
    .from('notes')
    .update({ source: '', source_id: null })
    .eq('source_id', sourceId)
  if (linkedErr) throw linkedErr

  const { data: legacyRows, error: legacyErr } = await supabase
    .from('notes')
    .select('id, source')
    .is('source_id', null)
    .not('source', 'eq', '')
  if (legacyErr) throw legacyErr

  const legacyIds = (legacyRows ?? [])
    .filter((row) => sourceTitleKey((row as { source: string }).source) === key)
    .map((row) => (row as { id: string }).id)

  if (legacyIds.length > 0) {
    const { error: clearLegacyErr } = await supabase
      .from('notes')
      .update({ source: '' })
      .in('id', legacyIds)
    if (clearLegacyErr) throw clearLegacyErr
  }

  const { error: deleteErr } = await supabase
    .from('sources')
    .delete()
    .eq('id', sourceId)
  if (deleteErr) throw deleteErr
}

/** 출처 삭제 시 로컬 메모 목록에서 출처 정보만 제거 */
export function mapNotesWithClearedSource(
  notes: NoteWithTags[],
  sourceId: string,
  titleKey?: string,
): NoteWithTags[] {
  return notes.map((n) => {
    if (n.source_id === sourceId || n.sources?.id === sourceId) {
      return { ...n, source: '', source_id: null, sources: null }
    }
    if (
      titleKey &&
      !n.source_id &&
      sourceTitleKey(noteSourceLabel(n)) === titleKey
    ) {
      return { ...n, source: '', source_id: null, sources: null }
    }
    return n
  })
}

/** 출처 이름 변경 시 연결된 메모 카드에 반영 */
export function mapNotesWithRenamedSource(
  notes: NoteWithTags[],
  sourceId: string,
  title: string,
): NoteWithTags[] {
  return notes.map((n) => {
    if (n.source_id === sourceId || n.sources?.id === sourceId) {
      return {
        ...n,
        source: title,
        source_id: sourceId,
        sources: { id: sourceId, title },
      }
    }
    return n
  })
}

/** 앱 로드 시 DB에 남은 고아 출처 일괄 정리 */
export async function pruneAllOrphanSources(): Promise<number> {
  const [all, inUse] = await Promise.all([fetchSources(), fetchSourcesInUse()])
  const inUseIds = new Set(inUse.map((s) => s.id))
  const orphanIds = all.filter((s) => !inUseIds.has(s.id)).map((s) => s.id)
  if (orphanIds.length === 0) return 0

  const { error } = await supabase.from('sources').delete().in('id', orphanIds)
  if (error) throw error
  return orphanIds.length
}

export function filterSourcesByQuery(all: SourceRow[], q: string): SourceRow[] {
  const raw = normalizeSourceTitle(q)
  if (!raw) return []
  const key = sourceTitleKey(raw)
  return all
    .filter((s) => sourceTitleKey(s.title).includes(key))
    .sort((a, b) => {
      const ak = sourceTitleKey(a.title)
      const bk = sourceTitleKey(b.title)
      const aStarts = ak.startsWith(key) ? 0 : 1
      const bStarts = bk.startsWith(key) ? 0 : 1
      return aStarts - bStarts || a.title.localeCompare(b.title, 'ko')
    })
    .slice(0, 8)
}

export function mergeSourcesFromNoteIntoAllSources(
  prev: SourceRow[],
  note: NoteWithTags,
): SourceRow[] {
  const src = note.sources
  if (!src?.id) return prev
  const byId = new Map(prev.map((s) => [s.id, s]))
  byId.set(src.id, { id: src.id, title: src.title })
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}

const NOTE_WITH_TAGS_SELECT = `
      id,
      body,
      source,
      source_id,
      created_at,
      sources ( id, title ),
      note_tags (
        tag_id,
        tags ( id, name, color_index )
      )
    `

/** 태그 필터 조회 — 해당 태그가 붙은 메모만 (inner join) */
const NOTE_WITH_TAG_FILTER_SELECT = `
      id,
      body,
      source,
      source_id,
      created_at,
      sources ( id, title ),
      note_tags!inner (
        tag_id,
        tags ( id, name, color_index )
      )
    `

/** @deprecated 초기 전체 로드 대신 fetchNotesPage 사용 */
export async function fetchNotesWithTags(): Promise<NoteWithTags[]> {
  const page = await fetchNotesPage()
  return page.notes
}

/** 최신순 페이지 — `before`는 이전 페이지 마지막 메모의 created_at (ISO) */
export async function fetchNotesPage(opts?: {
  limit?: number
  before?: string
}): Promise<NotesPageResult> {
  const limit = opts?.limit ?? NOTES_LIST_PAGE_SIZE
  let q = supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (opts?.before) {
    q = q.lt('created_at', opts.before)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as unknown as NoteRowDb[]
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    notes: slice.map((r) => toListPreviewNote(mapNoteRowFromDb(r))),
    hasMore,
  }
}

/** 태그가 전혀 없는 메모 — note_tags 행이 없는 notes만 (1회 조회) */
export async function fetchNotesPageWithNoTags(opts?: {
  limit?: number
  before?: string
}): Promise<NotesPageResult> {
  const limit = opts?.limit ?? NOTES_LIST_PAGE_SIZE
  let q = supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .is('note_tags', null)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (opts?.before) {
    q = q.lt('created_at', opts.before)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as unknown as NoteRowDb[]
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    notes: slice.map((r) => toListPreviewNote(mapNoteRowFromDb(r))),
    hasMore,
  }
}

/** 서버에 반영된 한 건만 조회(전체 목록 갈아끼우기 대신 국소 갱신용). */
export async function fetchNoteWithTagsById(
  noteId: string,
): Promise<NoteWithTags> {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .eq('id', noteId)
    .single()
  if (error) throw error
  return mapNoteRowFromDb(data as unknown as NoteRowDb)
}

/** 특정 태그 메모 — 최신순 페이지 (전체 note_tags 포함, 1회 조회) */
export async function fetchNotesPageForTag(
  tagId: string,
  opts?: { limit?: number; before?: string },
): Promise<NotesPageResult> {
  const limit = opts?.limit ?? NOTES_LIST_PAGE_SIZE
  let q = supabase
    .from('notes')
    .select(NOTE_WITH_TAG_FILTER_SELECT)
    .eq('note_tags.tag_id', tagId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (opts?.before) {
    q = q.lt('created_at', opts.before)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as unknown as NoteRowDb[]
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    notes: slice.map((r) => toListPreviewNote(mapNoteRowFromDb(r))),
    hasMore,
  }
}

/** 태그(또는 태그 없음) 클릭 시 — 해당 목록 1페이지만 조회 */
export async function pullTagNotesPage(
  tagId: string,
  opts?: { before?: string },
): Promise<NotesPageResult> {
  if (tagId === TAG_VIEW_NONE_ID) {
    return fetchNotesPageWithNoTags(opts)
  }
  return fetchNotesPageForTag(tagId, opts)
}

/** 태그 선택 시 — 해당 태그 메모 전부 조회 (더 보기 버튼 없음) */
export async function pullAllTagNotes(tagId: string): Promise<NotesPageResult> {
  const map = new Map<string, NoteWithTags>()
  let before: string | undefined
  let hasMore = true
  let pages = 0
  const maxPages = 80

  while (hasMore && pages < maxPages) {
    pages++
    const page = await pullTagNotesPage(tagId, { before })
    for (const note of page.notes) {
      map.set(note.id, note)
    }
    hasMore = page.hasMore
    if (page.notes.length === 0) break
    before = page.notes[page.notes.length - 1]?.created_at
  }

  return {
    notes: sortNotesNewestFirst([...map.values()]),
    hasMore: false,
  }
}

/** 여러 태그가 모두 붙은 메모 전량 조회 (교집합) */
export async function pullAllTagNotesForTagIds(
  tagIds: string[],
): Promise<NotesPageResult> {
  const ids = [...new Set(tagIds.filter(Boolean))]
  if (ids.length === 0) {
    return { notes: [], hasMore: false }
  }
  if (ids.length === 1) {
    return pullAllTagNotes(ids[0]!)
  }
  const page = await pullAllTagNotes(ids[ids.length - 1]!)
  return {
    notes: filterNotesForAllTagIds(page.notes, ids),
    hasMore: false,
  }
}

function dedupeNoteRows(rows: NoteRowDb[]): NoteRowDb[] {
  const seen = new Set<string>()
  const out: NoteRowDb[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/** 여러 태그(상위+하위)에 붙은 메모 — 최신순 페이지 */
export async function fetchNotesPageForTagIds(
  tagIds: string[],
  opts?: { limit?: number; before?: string },
): Promise<NotesPageResult> {
  const ids = [...new Set(tagIds.filter(Boolean))]
  if (ids.length === 0) {
    return { notes: [], hasMore: false }
  }
  if (ids.length === 1) {
    return fetchNotesPageForTag(ids[0]!, opts)
  }

  const limit = opts?.limit ?? NOTES_LIST_PAGE_SIZE
  let q = supabase
    .from('notes')
    .select(NOTE_WITH_TAG_FILTER_SELECT)
    .in('note_tags.tag_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (opts?.before) {
    q = q.lt('created_at', opts.before)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = dedupeNoteRows((data ?? []) as unknown as NoteRowDb[])
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    notes: slice.map((r) => toListPreviewNote(mapNoteRowFromDb(r))),
    hasMore,
  }
}

/** 특정 출처 메모 — 최신순 페이지 */
export async function fetchNotesPageForSource(
  sourceId: string,
  opts?: { limit?: number; before?: string },
): Promise<NotesPageResult> {
  const limit = opts?.limit ?? NOTES_LIST_PAGE_SIZE
  let q = supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (opts?.before) {
    q = q.lt('created_at', opts.before)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as unknown as NoteRowDb[]
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    notes: slice.map((r) => toListPreviewNote(mapNoteRowFromDb(r))),
    hasMore,
  }
}

export type SourceNotesSyncResult = {
  notes: NoteWithTags[]
  hasMore: boolean
}

export async function syncNotesStateAfterSourceSelectionPull(
  prev: NoteWithTags[],
  sourceId: string,
  opts?: { before?: string },
): Promise<SourceNotesSyncResult> {
  const page = await fetchNotesPageForSource(sourceId, { before: opts?.before })
  const fresh = page.notes

  if (opts?.before) {
    return {
      notes: mergeNotesById(prev, fresh),
      hasMore: page.hasMore,
    }
  }

  if (page.hasMore) {
    return {
      notes: mergeNotesById(prev, fresh),
      hasMore: true,
    }
  }

  const freshIds = new Set(fresh.map((n) => n.id))
  const staleIds = prev
    .filter((n) => noteHasSourceId(n, sourceId) && !freshIds.has(n.id))
    .map((n) => n.id)

  const map = new Map(prev.map((n) => [n.id, n]))
  for (const id of staleIds) {
    map.delete(id)
  }
  for (const n of fresh) {
    map.set(n.id, n)
  }
  return {
    notes: sortNotesNewestFirst(Array.from(map.values())),
    hasMore: false,
  }
}

/** 태그 뷰 「태그 없음」 — 서버에서 태그 없는 메모만 페이지 조회 */
export async function syncNotesStateAfterTagViewNonePull(
  prev: NoteWithTags[],
  opts?: { before?: string },
): Promise<TagNotesSyncResult> {
  const page = await fetchNotesPageWithNoTags({ before: opts?.before })
  const fresh = page.notes

  if (opts?.before) {
    return {
      notes: mergeNotesById(prev, fresh),
      hasMore: page.hasMore,
    }
  }

  if (page.hasMore) {
    return {
      notes: mergeNotesById(prev, fresh),
      hasMore: true,
    }
  }

  const freshIds = new Set(fresh.map((n) => n.id))
  const staleIds = prev
    .filter((n) => noteHasNoTagViewTags(n) && !freshIds.has(n.id))
    .map((n) => n.id)

  const map = new Map(prev.map((n) => [n.id, n]))
  for (const id of staleIds) {
    map.delete(id)
  }
  for (const n of fresh) {
    map.set(n.id, n)
  }
  return {
    notes: sortNotesNewestFirst(Array.from(map.values())),
    hasMore: false,
  }
}

/** @deprecated fetchNotesPageForTag 사용 */
export async function fetchNotesWithTagsForTag(
  tagId: string,
): Promise<NoteWithTags[]> {
  const page = await fetchNotesPageForTag(tagId)
  return page.notes
}

function noteHasAnyTagId(n: NoteWithTags, tagIds: Set<string>): boolean {
  return n.note_tags.some((nt) => {
    if (tagIds.has(nt.tag_id)) return true
    const id = nt.tags?.id
    return id != null && tagIds.has(id)
  })
}

function noteHasSourceId(n: NoteWithTags, sourceId: string): boolean {
  return (n.source_id ?? n.sources?.id) === sourceId
}

export type TagNotesSyncResult = {
  notes: NoteWithTags[]
  hasMore: boolean
}

/**
 * 태그 선택 시: 해당 태그 메모 1페이지를 서버에서 받아 `notes`에 병합.
 * 전체 태그 메모가 1페이지를 넘으면 stale 정리는 생략(더보기로 이어서 로드).
 */
export async function syncNotesStateAfterTagSelectionPull(
  prev: NoteWithTags[],
  tagId: string,
  opts?: { before?: string; tagIds?: string[] },
): Promise<TagNotesSyncResult> {
  const filterIds = opts?.tagIds?.length ? opts.tagIds : [tagId]
  const page = await fetchNotesPageForTagIds(filterIds, { before: opts?.before })
  const fresh = page.notes
  const filterIdSet = new Set(filterIds)

  if (opts?.before) {
    return {
      notes: mergeNotesById(prev, fresh),
      hasMore: page.hasMore,
    }
  }

  if (page.hasMore) {
    return {
      notes: mergeNotesById(prev, fresh),
      hasMore: true,
    }
  }

  const freshIds = new Set(fresh.map((n) => n.id))
  const staleIds = prev
    .filter((n) => noteHasAnyTagId(n, filterIdSet) && !freshIds.has(n.id))
    .map((n) => n.id)

  const map = new Map(prev.map((n) => [n.id, n]))
  for (const id of staleIds) {
    map.delete(id)
  }
  for (const n of fresh) {
    map.set(n.id, mergeNotePreferringFullTags(map.get(n.id) ?? n, n))
  }
  return {
    notes: sortNotesNewestFirst(Array.from(map.values())),
    hasMore: false,
  }
}

type NoteRowCore = {
  id: string
  body: string
  source: string
  source_id?: string | null
  created_at: string
}

function buildNoteWithTags(
  noteRow: NoteRowCore,
  tagLinks: {
    tag_id: string
    name: string
    color_index: number
    parent_id?: string | null
  }[],
  sourceRef?: { id: string; title: string } | null,
): NoteWithTags {
  const srcTitle = sourceRef?.title ?? noteRow.source ?? ''
  const srcId = sourceRef?.id ?? noteRow.source_id ?? null
  return {
    id: noteRow.id,
    body: noteRow.body,
    source: srcTitle,
    source_id: srcId,
    sources:
      srcId && srcTitle ? { id: srcId, title: srcTitle } : null,
    created_at: noteRow.created_at,
    note_tags: tagLinks.map(({ tag_id, name, color_index, parent_id }) => ({
      tag_id,
      tags: { id: tag_id, name, color_index, parent_id: parent_id ?? null },
    })),
  }
}

async function ensureSourceId(
  rawTitle: string,
  userId: string,
  cache: SourceRow[],
): Promise<{ id: string; title: string } | null> {
  const title = normalizeSourceTitle(rawTitle)
  if (!title) return null

  const key = sourceTitleKey(title)
  const hit = cache.find((s) => sourceTitleKey(s.title) === key)
  if (hit) return { id: hit.id, title: hit.title }

  const { data, error } = await supabase
    .from('sources')
    .insert({ user_id: userId, title })
    .select('id, title')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: row, error: e2 } = await supabase
        .from('sources')
        .select('id, title')
        .eq('user_id', userId)
        .eq('title_normalized', key)
        .maybeSingle()
      if (e2) {
        logNoteSaveError('create', '출처 중복 조회', { sourceTitle: title, userId }, e2)
        throw e2
      }
      if (!row) {
        logNoteSaveError('create', '출처 중복인데 행 없음', { sourceTitle: title, userId }, error)
        throw error
      }
      return row as { id: string; title: string }
    }
    logNoteSaveError('create', 'sources insert', { sourceTitle: title, userId }, error)
    throw error
  }

  const created = data as { id: string; title: string }
  cache.push({ id: created.id, title: created.title })
  return created
}

async function resolveTagIdsForNames(
  names: string[],
  userId: string,
  cache: TagRow[],
): Promise<
  { tag_id: string; name: string; color_index: number; parent_id?: string | null }[]
> {
  const uniqueNames = [...new Set(names)]
  const resolved = await Promise.all(
    uniqueNames.map(async (nm) => {
      const label = normalizeTagInput(nm)
      const { id, color_index, parent_id } = await ensureTagId(
        label,
        userId,
        cache,
      )
      return { tag_id: id, name: label, color_index, parent_id }
    }),
  )
  return resolved
}

async function ensureTagId(
  name: string,
  userId: string,
  cache: TagRow[],
): Promise<{ id: string; color_index: number; parent_id?: string | null }> {
  const label = normalizeTagInput(name)
  if (!label) throw new Error('태그 이름이 비었습니다.')

  const hit = cache.find(
    (t) => t.name.toLowerCase() === label.toLowerCase() || t.name === label,
  )
  if (hit) {
    return {
      id: hit.id,
      color_index: hit.color_index,
      parent_id: hit.parent_id ?? null,
    }
  }

  const color_index = pickColorIndex(label, cache)

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: userId,
      name: label,
      color_index,
    })
    .select('id, color_index, parent_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: row, error: e2 } = await supabase
        .from('tags')
        .select('id, color_index, parent_id')
        .eq('user_id', userId)
        .eq('name_normalized', label.toLowerCase())
        .maybeSingle()
      if (e2) {
        logNoteSaveError('create', '태그 중복 조회', { tagName: label, userId }, e2)
        throw e2
      }
      if (!row) {
        logNoteSaveError('create', '태그 중복인데 행 없음', { tagName: label, userId }, error)
        throw error
      }
      const found = row as { id: string; color_index: number; parent_id?: string | null }
      return {
        id: found.id,
        color_index: found.color_index,
        parent_id: found.parent_id ?? null,
      }
    }
    logNoteSaveError('create', '태그 insert', { tagName: label, userId, color_index }, error)
    throw error
  }

  const created = data as {
    id: string
    color_index: number
    parent_id?: string | null
  }
  cache.push({
    id: created.id,
    name: label,
    color_index: created.color_index,
    parent_id: created.parent_id ?? null,
  })
  return {
    id: created.id,
    color_index: created.color_index,
    parent_id: created.parent_id ?? null,
  }
}

/** 첫 진입 시 태그가 없으면 넣는 시작용 태그(사용자가 나중에 삭제 가능). */
const STARTER_TAG_NAMES = ['일상', '아이디어', '읽을거리'] as const

export async function ensureStarterTagsIfEmpty(
  userId: string,
): Promise<TagRow[]> {
  const existing = await fetchTags()
  if (existing.length > 0) {
    return existing
  }

  const cache: TagRow[] = []
  for (const name of STARTER_TAG_NAMES) {
    await ensureTagId(name, userId, cache)
  }
  return fetchTags()
}

async function assertValidParentTag(parentId: string): Promise<TagRow> {
  const tags = await fetchTags()
  const links = await fetchTagParentLinks()
  const parent = tags.find((t) => t.id === parentId)
  if (!parent) {
    throw new Error('상위 태그를 찾을 수 없습니다.')
  }
  if (parent.parent_id) {
    throw new Error('상위 태그만 하위를 둘 수 있습니다.')
  }
  if (!parent.is_parent && !tagHasChildren(parent.id, tags, links)) {
    throw new Error('상위 태그만 하위를 둘 수 있습니다.')
  }
  return parent
}

/** tags.parent_id 컬럼에 넣을 수 있는 태그만 (DB 트리거·다중 상위는 링크 테이블) */
function canSetTagPrimaryParentId(
  tag: TagRow,
  tags: TagRow[],
  links: TagParentLink[],
): boolean {
  if (tag.parent_id) return false
  if (tag.is_parent) return false
  if (tagHasChildren(tag.id, tags, links)) return false
  return true
}

/** 상위 태그 추가 (parent_id 없음, is_parent=true) */
export async function createParentTag(
  rawName: string,
  userId: string,
  opts?: { existingTags?: TagRow[] },
): Promise<TagRow> {
  const label = normalizeTagInput(rawName)
  if (!label) throw new Error('태그 이름이 비었습니다.')

  const normalized = label.toLowerCase()

  const promoteOrReturnParent = async (hit: TagRow): Promise<TagRow> => {
    if (hit.parent_id) {
      throw new Error('이미 다른 상위 태그 아래에 있는 태그입니다.')
    }
    if (hit.is_parent) return hit

    const { data, error } = await supabase
      .from('tags')
      .update({ is_parent: true })
      .eq('id', hit.id)
      .select('id, name, color_index, parent_id, is_parent, created_at')
      .single()
    if (error) throw error
    return data as TagRow
  }

  const findByNormalizedName = async (): Promise<TagRow | null> => {
    const { data, error } = await supabase
      .from('tags')
      .select('id, name, color_index, parent_id, is_parent, created_at')
      .eq('user_id', userId)
      .eq('name_normalized', normalized)
      .maybeSingle()
    if (error) throw error
    return (data as TagRow | null) ?? null
  }

  const hitFromCache = opts?.existingTags?.find(
    (t) => t.name.toLowerCase() === normalized || t.name === label,
  )
  if (hitFromCache) {
    return promoteOrReturnParent(hitFromCache)
  }

  const insertNew = async (): Promise<TagRow> => {
    const { data, error } = await supabase
      .from('tags')
      .insert({
        user_id: userId,
        name: label,
        color_index: pickColorIndex(label, opts?.existingTags ?? []),
        parent_id: null,
        is_parent: true,
      })
      .select('id, name, color_index, parent_id, is_parent, created_at')
      .single()
    if (error) {
      if (error.code === '23505') {
        const existing = await findByNormalizedName()
        if (!existing) throw error
        return promoteOrReturnParent(existing)
      }
      throw error
    }
    return data as TagRow
  }

  if (opts?.existingTags) {
    return insertNew()
  }

  const hit = await findByNormalizedName()
  if (hit) {
    return promoteOrReturnParent(hit)
  }
  return insertNew()
}

/** 상위 태그 아래 새 하위 태그 */
export async function createChildTag(
  rawName: string,
  parentId: string,
  userId: string,
): Promise<TagRow> {
  await assertValidParentTag(parentId)
  const label = normalizeTagInput(rawName)
  if (!label) throw new Error('태그 이름이 비었습니다.')

  const existing = await fetchTags()
  const hit = existing.find(
    (t) => t.name.toLowerCase() === label.toLowerCase() || t.name === label,
  )
  if (hit) {
    throw new Error('같은 이름의 태그가 이미 있습니다.')
  }

  const color_index = pickColorIndex(label, existing)
  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: userId,
      name: label,
      color_index,
      parent_id: parentId,
    })
    .select('id, name, color_index, parent_id, created_at')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 태그가 이미 있습니다.')
    }
    throw error
  }
  return data as TagRow
}

/** 독립 태그를 상위 태그 아래로 이동 (다중 상위태그 지원) */
export async function assignTagsToParent(
  tagIds: string[],
  parentId: string,
): Promise<TagRow[]> {
  await assertValidParentTag(parentId)
  const tags = await fetchTags()
  const links = await fetchTagParentLinks()
  const uniqueIds = [...new Set(tagIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    throw new Error('넣을 태그를 선택하세요.')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  for (const tagId of uniqueIds) {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) {
      throw new Error('태그를 찾을 수 없습니다.')
    }
    if (tagId === parentId) {
      throw new Error('상위 태그 자신은 넣을 수 없습니다.')
    }
  }

  const linkRows = uniqueIds.map((tagId) => ({
    user_id: user.id,
    tag_id: tagId,
    parent_tag_id: parentId,
  }))
  const { error: linkErr } = await supabase
    .from('tag_parent_links')
    .upsert(linkRows, { onConflict: 'tag_id,parent_tag_id' })
  if (
    linkErr &&
    linkErr.code !== 'PGRST205' &&
    linkErr.code !== '42P01' &&
    !linkErr.message.includes('tag_parent_links')
  ) {
    throw linkErr
  }

  const idsNeedParentId = uniqueIds.filter((tagId) => {
    const tag = tags.find((t) => t.id === tagId)
    return tag != null && canSetTagPrimaryParentId(tag, tags, links)
  })
  if (idsNeedParentId.length > 0) {
    const { error } = await supabase
      .from('tags')
      .update({ parent_id: parentId })
      .in('id', idsNeedParentId)
    if (error) {
      throw new Error(
        supabaseErrorMessage(
          error,
          '하위 태그를 연결하지 못했습니다. Supabase에 012_tag_parent_links 마이그레이션이 적용되었는지 확인하세요.',
        ),
      )
    }
  }

  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color_index, parent_id, created_at')
    .in('id', uniqueIds)
  if (error) throw error
  return (data ?? []) as TagRow[]
}

/** 하위 태그를 상위태그에서 분리 (parentId 지정 시 해당 상위만) */
export async function unassignTagFromParent(
  tagId: string,
  parentId?: string,
): Promise<TagRow> {
  if (parentId) {
    const { error: linkErr } = await supabase
      .from('tag_parent_links')
      .delete()
      .eq('tag_id', tagId)
      .eq('parent_tag_id', parentId)
    if (
      linkErr &&
      linkErr.code !== 'PGRST205' &&
      linkErr.code !== '42P01' &&
      !linkErr.message.includes('tag_parent_links')
    ) {
      throw linkErr
    }

    const tags = await fetchTags()
    const tag = tags.find((t) => t.id === tagId)
    if (tag?.parent_id === parentId) {
      const { data, error } = await supabase
        .from('tags')
        .update({ parent_id: null })
        .eq('id', tagId)
        .select('id, name, color_index, parent_id, created_at')
        .single()
      if (error) throw error
      return data as TagRow
    }
    if (tag) return tag
    throw new Error('태그를 찾을 수 없습니다.')
  }

  const { error: linkErr } = await supabase
    .from('tag_parent_links')
    .delete()
    .eq('tag_id', tagId)
  if (
    linkErr &&
    linkErr.code !== 'PGRST205' &&
    linkErr.code !== '42P01' &&
    !linkErr.message.includes('tag_parent_links')
  ) {
    throw linkErr
  }

  const { data, error } = await supabase
    .from('tags')
    .update({ parent_id: null })
    .eq('id', tagId)
    .select('id, name, color_index, parent_id, created_at')
    .single()
  if (error) throw error
  return data as TagRow
}

/** 상위태그의 하위 태그 목록을 선택 상태와 동기화 */
export async function syncParentTagChildren(
  parentId: string,
  childTagIds: string[],
): Promise<{ tags: TagRow[]; links: TagParentLink[] }> {
  await assertValidParentTag(parentId)
  const tags = await fetchTags()
  const links = await fetchTagParentLinks()
  const desired = new Set(childTagIds.filter(Boolean))

  const current = new Set<string>()
  for (const t of tags) {
    if (t.parent_id === parentId) current.add(t.id)
  }
  for (const l of links) {
    if (l.parent_tag_id === parentId) current.add(l.tag_id)
  }

  for (const id of current) {
    if (!desired.has(id)) {
      await unassignTagFromParent(id, parentId)
    }
  }

  const toAdd = [...desired].filter((id) => !current.has(id))
  if (toAdd.length > 0) {
    await assignTagsToParent(toAdd, parentId)
  }

  return {
    tags: await fetchTags(),
    links: await fetchTagParentLinks(),
  }
}

/** 태그의 상위 태그 변경 (null = 상위 없음) */
export async function updateTagParent(
  tagId: string,
  parentId: string | null,
): Promise<TagRow> {
  if (parentId === null) {
    return unassignTagFromParent(tagId)
  }
  await assignTagsToParent([tagId], parentId)
  const tags = await fetchTags()
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) {
    throw new Error('태그를 찾을 수 없습니다.')
  }
  return tag
}

const TAG_ROW_SELECT =
  'id, name, color_index, parent_id, is_parent, created_at'

export type PromoteTagToParentResult = {
  parent: TagRow
  assignedChildren: TagRow[]
}

/**
 * 독립 태그를 상위태그(책)로 승격.
 * - 이 태그가 붙은 메모는 그대로 유지
 * - 멀티태그는 자동 하위 편입하지 않음 (하위는 설정에서만 지정)
 */
export async function promoteTagToParent(
  tagId: string,
): Promise<PromoteTagToParentResult> {
  const tags = await fetchTags()
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) {
    throw new Error('태그를 찾을 수 없습니다.')
  }
  if (tag.is_parent) {
    throw new Error('이미 상위태그입니다.')
  }

  if (tag.parent_id) {
    const { error: detachErr } = await supabase
      .from('tags')
      .update({ parent_id: null })
      .eq('id', tagId)
    if (detachErr) throw detachErr
  }

  const { data: parent, error: parentErr } = await supabase
    .from('tags')
    .update({ is_parent: true, parent_id: null })
    .eq('id', tagId)
    .select(TAG_ROW_SELECT)
    .single()
  if (parentErr) {
    throw new Error(
      supabaseErrorMessage(
        parentErr,
        '상위태그로 표시하지 못했습니다. Supabase에 011_tag_is_parent 마이그레이션이 적용되었는지 확인하세요.',
      ),
    )
  }

  return {
    parent: parent as TagRow,
    assignedChildren: [],
  }
}

/** 검색으로 새 태그만 만들 때 (메모 없이) */
export async function createStandaloneTag(
  rawName: string,
  userId: string,
): Promise<TagRow> {
  const existing = await fetchTags()
  const { id, color_index } = await ensureTagId(
    rawName,
    userId,
    [...existing],
  )
  const label = normalizeTagInput(rawName)
  return { id, name: label, color_index, parent_id: null }
}

export async function createNoteWithTags(
  body: string,
  tagNames: string[],
  userId: string,
  tagCache: TagRow[],
  source?: string,
  sourceCache: SourceRow[] = [],
): Promise<NoteWithTags> {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  const labels = tagNames.map((t) => normalizeTagInput(t)).filter(Boolean)
  const meta = noteSavePayloadMeta(body, source ?? '', tagNames)
  console.info('[태그노트] 메모 create 시작', { userId, ...meta })

  if (labels.length === 0) {
    const err = new Error('태그를 하나 이상 추가하세요.')
    logNoteSaveError('create', '입력 검증', { userId, ...meta }, err)
    throw err
  }

  let tagLinks: {
    tag_id: string
    name: string
    color_index: number
    parent_id?: string | null
  }[]
  try {
    tagLinks = await resolveTagIdsForNames(
      labels,
      userId,
      tagCache,
    )
  } catch (error) {
    logNoteSaveError('create', '태그 ID 해석', { userId, ...meta }, error)
    throw error
  }

  let sourceRef: { id: string; title: string } | null = null
  if (sourceTrim) {
    try {
      sourceRef = await ensureSourceId(sourceTrim, userId, sourceCache)
    } catch (error) {
      logNoteSaveError('create', '출처 ID 해석', { userId, ...meta }, error)
      throw error
    }
  }

  const { data: note, error: nErr } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      body: trimmed,
      source: sourceRef?.title ?? sourceTrim,
      source_id: sourceRef?.id ?? null,
    })
    .select('id, body, source, source_id, created_at')
    .single()
  if (nErr) {
    logNoteSaveError('create', 'notes insert', { userId, ...meta }, nErr)
    throw nErr
  }
  const noteRow = note as NoteRowCore

  const rows = tagLinks.map(({ tag_id }) => ({ note_id: noteRow.id, tag_id }))
  const { error: jErr } = await supabase.from('note_tags').insert(rows)
  if (jErr) {
    logNoteSaveError('create', 'note_tags insert', {
      userId,
      noteId: noteRow.id,
      tagIds: tagLinks.map((t) => t.tag_id),
      ...meta,
    }, jErr)
    throw jErr
  }
  console.info('[태그노트] 메모 create 성공', { noteId: noteRow.id, ...meta })
  return buildNoteWithTags(noteRow, tagLinks, sourceRef)
}

export async function updateNoteWithTags(
  noteId: string,
  body: string,
  tagNames: string[],
  userId: string,
  tagCache: TagRow[],
  source?: string,
  sourceCache: SourceRow[] = [],
): Promise<NoteWithTags> {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  const labels = tagNames.map((t) => normalizeTagInput(t)).filter(Boolean)
  const meta = { noteId, userId, ...noteSavePayloadMeta(body, source ?? '', tagNames) }
  console.info('[태그노트] 메모 update 시작', meta)

  if (labels.length === 0) {
    const err = new Error('태그를 하나 이상 유지하세요.')
    logNoteSaveError('update', '입력 검증', meta, err)
    throw err
  }

  let tagLinks: { tag_id: string; name: string; color_index: number }[]
  try {
    tagLinks = await resolveTagIdsForNames(labels, userId, tagCache)
  } catch (error) {
    logNoteSaveError('update', '태그 ID 해석', meta, error)
    throw error
  }
  const newTagIds = new Set(tagLinks.map((t) => t.tag_id))

  let sourceRef: { id: string; title: string } | null = null
  if (sourceTrim) {
    try {
      sourceRef = await ensureSourceId(sourceTrim, userId, sourceCache)
    } catch (error) {
      logNoteSaveError('update', '출처 ID 해석', meta, error)
      throw error
    }
  }

  const { data: note, error: uErr } = await supabase
    .from('notes')
    .update({
      body: trimmed,
      source: sourceRef?.title ?? sourceTrim,
      source_id: sourceRef?.id ?? null,
    })
    .eq('id', noteId)
    .select('id, body, source, source_id, created_at')
    .single()
  if (uErr) {
    logNoteSaveError('update', 'notes update', meta, uErr)
    throw uErr
  }
  const noteRow = note as NoteRowCore

  const { data: currentLinks, error: qErr } = await supabase
    .from('note_tags')
    .select('tag_id')
    .eq('note_id', noteId)
  if (qErr) {
    logNoteSaveError('update', 'note_tags select', meta, qErr)
    throw qErr
  }
  const currentTagIds = new Set(
    (currentLinks ?? []).map((l) => (l as { tag_id: string }).tag_id),
  )

  const toAdd = tagLinks.filter((t) => !currentTagIds.has(t.tag_id))
  if (toAdd.length > 0) {
    const { error: jErr } = await supabase.from('note_tags').insert(
      toAdd.map(({ tag_id }) => ({ note_id: noteId, tag_id })),
    )
    if (jErr) {
      logNoteSaveError('update', 'note_tags insert', {
        ...meta,
        tagIds: toAdd.map((t) => t.tag_id),
      }, jErr)
      throw jErr
    }
  }

  const toRemove = [...currentTagIds].filter((id) => !newTagIds.has(id))
  if (toRemove.length > 0) {
    const { error: dErr } = await supabase
      .from('note_tags')
      .delete()
      .eq('note_id', noteId)
      .in('tag_id', toRemove)
    if (dErr) {
      logNoteSaveError('update', 'note_tags delete', {
        ...meta,
        tagIds: toRemove,
      }, dErr)
      throw dErr
    }
  }

  console.info('[태그노트] 메모 update 성공', meta)
  return buildNoteWithTags(noteRow, tagLinks, sourceRef)
}

export async function deleteNote(noteId: string): Promise<void> {
  /** 메모 삭제는 EditNoteModal에서만 호출 */
  const { error } = await supabase.from('notes').delete().eq('id', noteId)
  if (error) throw error
}

/** 태그 이름 수정 (본인 소유 행만 RLS) */
export async function updateTag(tagId: string, rawName: string): Promise<TagRow> {
  const label = normalizeTagInput(rawName)
  if (!label) throw new Error('태그 이름이 비었습니다.')
  const { data, error } = await supabase
    .from('tags')
    .update({ name: label })
    .eq('id', tagId)
    .select(TAG_ROW_SELECT)
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 태그가 이미 있습니다.')
    }
    throw error
  }
  return data as TagRow
}

export type TagDeleteResult = {
  deletedTagId: string
  deletedNoteIds: string[]
}

/**
 * 태그 삭제 — 메모는 유지하고 note_tags·상위 연결만 제거.
 * 메모 삭제는 EditNoteModal의 deleteNote만 사용합니다.
 */
export async function deleteTag(tagId: string): Promise<TagDeleteResult> {
  const { error: noteLinkErr } = await supabase
    .from('note_tags')
    .delete()
    .eq('tag_id', tagId)
  if (noteLinkErr) throw noteLinkErr

  const { error: parentLinkErr } = await supabase
    .from('tag_parent_links')
    .delete()
    .or(`tag_id.eq.${tagId},parent_tag_id.eq.${tagId}`)
  if (
    parentLinkErr &&
    parentLinkErr.code !== 'PGRST205' &&
    parentLinkErr.code !== '42P01' &&
    !parentLinkErr.message.includes('tag_parent_links')
  ) {
    throw parentLinkErr
  }

  const { error: tErr } = await supabase.from('tags').delete().eq('id', tagId)
  if (tErr) throw tErr

  return { deletedTagId: tagId, deletedNoteIds: [] }
}

/** @deprecated deleteTag 사용 — 메모는 삭제하지 않습니다 */
export const deleteTagAndLinkedNotes = deleteTag

/** 상위태그 삭제 — 메모는 유지, note_tags·하위 parent_id만 DB cascade/set null */
export async function deleteParentTag(tagId: string): Promise<TagDeleteResult> {
  const { error: tErr } = await supabase.from('tags').delete().eq('id', tagId)
  if (tErr) throw tErr

  return { deletedTagId: tagId, deletedNoteIds: [] }
}

/** note에 붙은 태그 메타를 allTags 맵에 반영(추가·이름 갱신). */
export function mergeTagsFromNoteIntoAllTags(
  prev: TagRow[],
  note: NoteWithTags,
): TagRow[] {
  const byId = new Map(prev.map((t) => [t.id, { ...t }]))
  for (const nt of note.note_tags) {
    const tg = nt.tags
    if (!tg || !isPersistedTagId(tg.id)) continue
    const cur = byId.get(tg.id)
    byId.set(tg.id, {
      id: tg.id,
      name: tg.name,
      color_index: tg.color_index,
      parent_id: tg.parent_id ?? cur?.parent_id ?? null,
      is_parent: cur?.is_parent,
      created_at: cur?.created_at,
    })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 태그 이름 변경 시 모든 메모 카드에 반영 */
export function mapNotesWithRenamedTag(
  notes: NoteWithTags[],
  tagId: string,
  name: string,
  color_index: number,
): NoteWithTags[] {
  return notes.map((n) => ({
    ...n,
    note_tags: n.note_tags.map((nt) => {
      if (nt.tag_id !== tagId && nt.tags?.id !== tagId) return nt
      return {
        tag_id: tagId,
        tags: { id: tagId, name, color_index },
      }
    }),
  }))
}

function tagSearchKeys(raw: string): { plain: string; compact: string } {
  const plain = normalizeTagInput(raw).toLowerCase()
  return { plain, compact: plain.replace(/\s+/g, '') }
}

/** 태그 이름 검색: 검색어가 태그 이름에 들어있을 때만 (엄격). -1이면 제외. */
export function tagMainSearchScore(name: string, rawQuery: string): number {
  const query = tagSearchKeys(rawQuery)
  const tag = tagSearchKeys(name)
  if (!query.plain) return 0

  if (tag.plain === query.plain || tag.compact === query.compact) return 1000
  if (
    tag.plain.startsWith(query.plain) ||
    tag.compact.startsWith(query.compact)
  ) {
    return 900
  }
  if (
    tag.plain.includes(query.plain) ||
    tag.compact.includes(query.compact)
  ) {
    return 800
  }
  return -1
}

function rankTagsByMainSearch(all: TagRow[], raw: string): TagRow[] {
  return all
    .map((t) => ({ t, score: tagMainSearchScore(t.name, raw) }))
    .filter((x) => x.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.t.name.localeCompare(b.t.name, 'ko'),
    )
    .map((x) => x.t)
}

export function filterTagsByQuery(all: TagRow[], q: string, excludeIds: string[]): TagRow[] {
  const raw = normalizeTagInput(q)
  if (!raw) return []
  return rankTagsByMainSearch(
    all.filter((t) => !excludeIds.includes(t.id)),
    raw,
  )
}

/** 메인 태그 그리드: 검색어 없으면 전체, 있으면 일치도 순 */
export function filterTagsByMainSearch(all: TagRow[], q: string): TagRow[] {
  const persisted = all.filter((t) => isPersistedTagId(t.id))
  const raw = normalizeTagInput(q)
  if (!raw) {
    return [...persisted].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }
  return rankTagsByMainSearch(persisted, raw)
}

/** 메모 본문만 검색 (태그 이름·출처 제외) */
export function noteBodyMatchesMainSearch(
  note: NoteWithTags,
  q: string,
): boolean {
  const raw = normalizeTagInput(q)
  if (!raw) return false
  const needle = raw.toLowerCase()
  return (note.body ?? '').toLowerCase().includes(needle)
}

/** 메인 검색: 본문·출처·붙은 태그 이름 중 하나라도 맞으면 true */
export function noteMatchesMainSearch(note: NoteWithTags, q: string): boolean {
  const raw = normalizeTagInput(q)
  if (!raw) return false
  const needle = raw.toLowerCase()
  const body = (note.body ?? '').toLowerCase()
  const src = (note.source ?? '').toLowerCase()
  if (body.includes(needle) || src.includes(needle)) return true
  return note.note_tags.some((nt) => {
    if (!nt.tags?.name) return false
    return tagMainSearchScore(nt.tags.name, raw) >= 0
  })
}

/** 메인 검색: 메모 본문·출처·태그 이름 (클라이언트 캐시용) */
export function filterNotesByMainSearch(
  notes: NoteWithTags[],
  q: string,
): NoteWithTags[] {
  const raw = normalizeTagInput(q)
  if (!raw) return []
  return notes.filter((n) => noteMatchesMainSearch(n, raw))
}

/** 메인 검색: 서버에서 본문·출처 ilike + 검색에 걸린 태그가 붙은 메모 (상한 있음) */
export async function fetchNotesForMainSearch(
  q: string,
  matchingTagIds: string[],
): Promise<NotesSearchResult> {
  const raw = normalizeTagInput(q)
  if (!raw) return { notes: [], hasMore: false }

  const byId = new Map<string, NoteWithTags>()
  const pattern = ilikePattern(raw)
  const fetchLimit = NOTES_SEARCH_LIMIT + 1

  const [bodyRes, sourceRes] = await Promise.all([
    supabase
      .from('notes')
      .select(NOTE_WITH_TAGS_SELECT)
      .ilike('body', pattern)
      .order('created_at', { ascending: false })
      .limit(fetchLimit),
    supabase
      .from('notes')
      .select(NOTE_WITH_TAGS_SELECT)
      .ilike('source', pattern)
      .order('created_at', { ascending: false })
      .limit(fetchLimit),
  ])
  if (bodyRes.error) throw bodyRes.error
  if (sourceRes.error) throw sourceRes.error
  for (const n of (bodyRes.data ?? []) as unknown as NoteRowDb[]) {
    byId.set(n.id, mapNoteRowFromDb(n))
  }
  for (const n of (sourceRes.data ?? []) as unknown as NoteRowDb[]) {
    byId.set(n.id, mapNoteRowFromDb(n))
  }

  if (matchingTagIds.length > 0) {
    const persistedTagIds = matchingTagIds.filter(isPersistedTagId)
    if (persistedTagIds.length > 0) {
      const { data: links, error: e2 } = await supabase
        .from('note_tags')
        .select('note_id')
        .in('tag_id', persistedTagIds)
      if (e2) throw e2
      const noteIds = [
        ...new Set(
          (links ?? []).map((l) => (l as { note_id: string }).note_id),
        ),
      ].filter((id) => !byId.has(id))

      if (noteIds.length > 0) {
        const { data: tagRows, error: e3 } = await supabase
          .from('notes')
          .select(NOTE_WITH_TAGS_SELECT)
          .in('id', noteIds)
          .order('created_at', { ascending: false })
          .limit(fetchLimit)
        if (e3) throw e3
        for (const n of (tagRows ?? []) as unknown as NoteRowDb[]) {
          byId.set(n.id, mapNoteRowFromDb(n))
        }
      }
    }
  }

  const sorted = sortNotesNewestFirst([...byId.values()])
  const hasMore = sorted.length > NOTES_SEARCH_LIMIT
  const slice = sorted.slice(0, NOTES_SEARCH_LIMIT).map((n) => toListPreviewNote(n))
  return { notes: slice, hasMore }
}

export function mergeNotesById(
  prev: NoteWithTags[],
  incoming: NoteWithTags[],
): NoteWithTags[] {
  const map = new Map(prev.map((n) => [n.id, n]))
  for (const n of incoming) {
    const cur = map.get(n.id)
    map.set(n.id, cur ? mergeNotePreferringFullTags(cur, n) : n)
  }
  return sortNotesNewestFirst([...map.values()])
}
