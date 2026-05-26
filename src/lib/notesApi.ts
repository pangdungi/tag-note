import { supabase } from './supabase'
import { normalizeTagInput, pickColorIndex, tagsAreSimilar } from './tagUtils'

export type TagRow = {
  id: string
  name: string
  color_index: number
  created_at?: string
}

export type NoteWithTags = {
  id: string
  body: string
  source: string
  created_at: string
  note_tags: {
    tag_id: string
    tags: { id: string; name: string; color_index: number } | null
  }[]
}

export async function fetchTags(): Promise<TagRow[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color_index, created_at')
    .order('name')
  if (error) throw error
  return (data ?? []) as TagRow[]
}

const NOTE_WITH_TAGS_SELECT = `
      id,
      body,
      source,
      created_at,
      note_tags (
        tag_id,
        tags ( id, name, color_index )
      )
    `

export async function fetchNotesWithTags(): Promise<NoteWithTags[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as NoteWithTags[]
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
  return data as unknown as NoteWithTags
}

function noteHasTagId(n: NoteWithTags, tagId: string): boolean {
  return n.note_tags.some(
    (nt) => nt.tag_id === tagId || nt.tags?.id === tagId,
  )
}

/** 특정 태그가 붙은 메모만 조회(전체 목록 대신 태그 클릭 시 동기화용). */
export async function fetchNotesWithTagsForTag(
  tagId: string,
): Promise<NoteWithTags[]> {
  const { data: links, error: e1 } = await supabase
    .from('note_tags')
    .select('note_id')
    .eq('tag_id', tagId)
  if (e1) throw e1
  const noteIds = [
    ...new Set(
      (links ?? []).map((l) => (l as { note_id: string }).note_id),
    ),
  ]
  if (noteIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .in('id', noteIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as NoteWithTags[]
}

/**
 * 태그 선택 시: 해당 태그가 달린 메모만 서버에서 받아 기존 `notes` 상태에 병합한다.
 * (이 태그를 뗀 메모는 개별 재조회로 반영, 삭제된 메모는 제거)
 */
export async function syncNotesStateAfterTagSelectionPull(
  prev: NoteWithTags[],
  tagId: string,
): Promise<NoteWithTags[]> {
  const fresh = await fetchNotesWithTagsForTag(tagId)
  const freshIds = new Set(fresh.map((n) => n.id))
  const staleIds = prev
    .filter((n) => noteHasTagId(n, tagId) && !freshIds.has(n.id))
    .map((n) => n.id)

  const staleRows = await Promise.all(
    staleIds.map(async (id) => {
      try {
        return await fetchNoteWithTagsById(id)
      } catch {
        return null
      }
    }),
  )

  const map = new Map(prev.map((n) => [n.id, n]))
  for (const id of staleIds) {
    map.delete(id)
  }
  for (const n of fresh) {
    map.set(n.id, n)
  }
  for (const row of staleRows) {
    if (row) {
      map.set(row.id, row)
    }
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

type NoteRowCore = {
  id: string
  body: string
  source: string
  created_at: string
}

function buildNoteWithTags(
  noteRow: NoteRowCore,
  tagLinks: { tag_id: string; name: string; color_index: number }[],
): NoteWithTags {
  return {
    id: noteRow.id,
    body: noteRow.body,
    source: noteRow.source ?? '',
    created_at: noteRow.created_at,
    note_tags: tagLinks.map(({ tag_id, name, color_index }) => ({
      tag_id,
      tags: { id: tag_id, name, color_index },
    })),
  }
}

async function resolveTagIdsForNames(
  names: string[],
  userId: string,
  cache: TagRow[],
): Promise<{ tag_id: string; name: string; color_index: number }[]> {
  const uniqueNames = [...new Set(names)]
  const resolved = await Promise.all(
    uniqueNames.map(async (nm) => {
      const label = normalizeTagInput(nm)
      const { id, color_index } = await ensureTagId(label, userId, cache)
      return { tag_id: id, name: label, color_index }
    }),
  )
  return resolved
}

async function ensureTagId(
  name: string,
  userId: string,
  cache: TagRow[],
): Promise<{ id: string; color_index: number }> {
  const label = normalizeTagInput(name)
  if (!label) throw new Error('태그 이름이 비었습니다.')

  const hit = cache.find(
    (t) => t.name.toLowerCase() === label.toLowerCase() || t.name === label,
  )
  if (hit) return { id: hit.id, color_index: hit.color_index }

  const color_index = pickColorIndex(label, cache)

  const { data, error } = await supabase
    .from('tags')
    .insert({ user_id: userId, name: label, color_index })
    .select('id, color_index')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: row, error: e2 } = await supabase
        .from('tags')
        .select('id, color_index')
        .eq('user_id', userId)
        .eq('name_normalized', label.toLowerCase())
        .maybeSingle()
      if (e2) throw e2
      if (!row) throw error
      return row as { id: string; color_index: number }
    }
    throw error
  }

  const created = data as { id: string; color_index: number }
  cache.push({
    id: created.id,
    name: label,
    color_index: created.color_index,
  })
  return created
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
  return { id, name: label, color_index }
}

export async function createNoteWithTags(
  body: string,
  tagNames: string[],
  userId: string,
  tagCache: TagRow[],
  source?: string,
): Promise<NoteWithTags> {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  const labels = tagNames.map((t) => normalizeTagInput(t)).filter(Boolean)
  if (labels.length === 0) throw new Error('태그를 하나 이상 추가하세요.')

  const { data: note, error: nErr } = await supabase
    .from('notes')
    .insert({ user_id: userId, body: trimmed, source: sourceTrim })
    .select('id, body, source, created_at')
    .single()
  if (nErr) throw nErr
  const noteRow = note as NoteRowCore

  const tagLinks = await resolveTagIdsForNames(labels, userId, tagCache)

  const rows = tagLinks.map(({ tag_id }) => ({ note_id: noteRow.id, tag_id }))
  const { error: jErr } = await supabase.from('note_tags').insert(rows)
  if (jErr) throw jErr
  return buildNoteWithTags(noteRow, tagLinks)
}

export async function updateNoteWithTags(
  noteId: string,
  body: string,
  tagNames: string[],
  userId: string,
  tagCache: TagRow[],
  source?: string,
): Promise<NoteWithTags> {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  const labels = tagNames.map((t) => normalizeTagInput(t)).filter(Boolean)
  if (labels.length === 0) throw new Error('태그를 하나 이상 유지하세요.')

  const { data: note, error: uErr } = await supabase
    .from('notes')
    .update({ body: trimmed, source: sourceTrim })
    .eq('id', noteId)
    .select('id, body, source, created_at')
    .single()
  if (uErr) throw uErr
  const noteRow = note as NoteRowCore

  const { error: dErr } = await supabase.from('note_tags').delete().eq('note_id', noteId)
  if (dErr) throw dErr

  const tagLinks = await resolveTagIdsForNames(labels, userId, tagCache)

  const linkRows = tagLinks.map(({ tag_id }) => ({ note_id: noteId, tag_id }))
  if (linkRows.length > 0) {
    const { error: jErr } = await supabase.from('note_tags').insert(linkRows)
    if (jErr) throw jErr
  }
  return buildNoteWithTags(noteRow, tagLinks)
}

export async function deleteNote(noteId: string): Promise<void> {
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
    .select('id, name, color_index, created_at')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 태그가 이미 있습니다.')
    }
    throw error
  }
  return data as TagRow
}

/**
 * 태그 삭제 전: 이 태그가 붙은 모든 메모를 먼저 삭제한 뒤 태그 삭제.
 * (메모에 다른 태그가 있어도 해당 메모 행 전체가 삭제됩니다.)
 */
export type TagDeleteResult = {
  deletedTagId: string
  deletedNoteIds: string[]
}

export async function deleteTagAndLinkedNotes(
  tagId: string,
): Promise<TagDeleteResult> {
  const { data: links, error: qErr } = await supabase
    .from('note_tags')
    .select('note_id')
    .eq('tag_id', tagId)
  if (qErr) throw qErr

  const noteIds = [
    ...new Set((links ?? []).map((r: { note_id: string }) => r.note_id)),
  ]

  if (noteIds.length > 0) {
    const { error: nErr } = await supabase.from('notes').delete().in('id', noteIds)
    if (nErr) throw nErr
  }

  const { error: tErr } = await supabase.from('tags').delete().eq('id', tagId)
  if (tErr) throw tErr
  return { deletedTagId: tagId, deletedNoteIds: noteIds }
}

/** note에 붙은 태그 메타를 allTags 맵에 반영(추가·이름 갱신). */
export function mergeTagsFromNoteIntoAllTags(
  prev: TagRow[],
  note: NoteWithTags,
): TagRow[] {
  const byId = new Map(prev.map((t) => [t.id, { ...t }]))
  for (const nt of note.note_tags) {
    const tg = nt.tags
    if (!tg) continue
    const cur = byId.get(tg.id)
    byId.set(tg.id, {
      id: tg.id,
      name: tg.name,
      color_index: tg.color_index,
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

/** 메인 검색·태그 입력 제안용 일치 점수 (높을수록 더 잘 맞음). -1이면 제외. */
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
  if (tagsAreSimilar(name, rawQuery)) return 500

  const qc = query.compact
  const nc = tag.compact
  if (qc.length >= 2) {
    for (let len = qc.length; len >= 2; len--) {
      for (let i = 0; i <= qc.length - len; i++) {
        const sub = qc.slice(i, i + len)
        if (nc.includes(sub)) return 300 + len * 10
      }
    }
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
  const raw = normalizeTagInput(q)
  if (!raw) {
    return [...all].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }
  return rankTagsByMainSearch(all, raw)
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

/** 메인 검색: 서버에서 본문·출처 ilike + 검색에 걸린 태그가 붙은 메모 전부 */
export async function fetchNotesForMainSearch(
  q: string,
  matchingTagIds: string[],
): Promise<NoteWithTags[]> {
  const raw = normalizeTagInput(q)
  if (!raw) return []

  const byId = new Map<string, NoteWithTags>()

  const { data: textRows, error: e1 } = await supabase
    .from('notes')
    .select(NOTE_WITH_TAGS_SELECT)
    .or(`body.ilike.%${raw}%,source.ilike.%${raw}%`)
    .order('created_at', { ascending: false })
  if (e1) throw e1
  for (const n of (textRows ?? []) as unknown as NoteWithTags[]) {
    byId.set(n.id, n)
  }

  if (matchingTagIds.length > 0) {
    const { data: links, error: e2 } = await supabase
      .from('note_tags')
      .select('note_id')
      .in('tag_id', matchingTagIds)
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
      if (e3) throw e3
      for (const n of (tagRows ?? []) as unknown as NoteWithTags[]) {
        byId.set(n.id, n)
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export function mergeNotesById(
  prev: NoteWithTags[],
  incoming: NoteWithTags[],
): NoteWithTags[] {
  const map = new Map(prev.map((n) => [n.id, n]))
  for (const n of incoming) {
    map.set(n.id, n)
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}
