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

export async function fetchNotesWithTags(): Promise<NoteWithTags[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(
      `
      id,
      body,
      source,
      created_at,
      note_tags (
        tag_id,
        tags ( id, name, color_index )
      )
    `,
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as NoteWithTags[]
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
): Promise<void> {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  const labels = tagNames.map((t) => normalizeTagInput(t)).filter(Boolean)
  if (labels.length === 0) throw new Error('태그를 하나 이상 추가하세요.')

  const { data: note, error: nErr } = await supabase
    .from('notes')
    .insert({ user_id: userId, body: trimmed, source: sourceTrim })
    .select('id')
    .single()
  if (nErr) throw nErr
  const noteId = (note as { id: string }).id

  const uniqueNames = [...new Set(labels)]
  const tagIds: string[] = []
  for (const nm of uniqueNames) {
    const { id } = await ensureTagId(nm, userId, tagCache)
    tagIds.push(id)
  }

  const rows = tagIds.map((tag_id) => ({ note_id: noteId, tag_id }))
  const { error: jErr } = await supabase.from('note_tags').insert(rows)
  if (jErr) throw jErr
}

export async function updateNoteWithTags(
  noteId: string,
  body: string,
  tagNames: string[],
  userId: string,
  tagCache: TagRow[],
  source?: string,
): Promise<void> {
  const trimmed = body.trim()
  const sourceTrim = (source ?? '').trim()
  const labels = tagNames.map((t) => normalizeTagInput(t)).filter(Boolean)
  if (labels.length === 0) throw new Error('태그를 하나 이상 유지하세요.')

  const { error: uErr } = await supabase
    .from('notes')
    .update({ body: trimmed, source: sourceTrim })
    .eq('id', noteId)
  if (uErr) throw uErr

  const { error: dErr } = await supabase.from('note_tags').delete().eq('note_id', noteId)
  if (dErr) throw dErr

  const uniqueNames = [...new Set(labels)]
  const tagIds: string[] = []
  for (const nm of uniqueNames) {
    const { id } = await ensureTagId(nm, userId, tagCache)
    tagIds.push(id)
  }

  const linkRows = tagIds.map((tag_id) => ({ note_id: noteId, tag_id }))
  if (linkRows.length > 0) {
    const { error: jErr } = await supabase.from('note_tags').insert(linkRows)
    if (jErr) throw jErr
  }
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', noteId)
  if (error) throw error
}

/** 태그 이름 수정 (본인 소유 행만 RLS) */
export async function updateTag(tagId: string, rawName: string): Promise<void> {
  const label = normalizeTagInput(rawName)
  if (!label) throw new Error('태그 이름이 비었습니다.')
  const { error } = await supabase
    .from('tags')
    .update({ name: label })
    .eq('id', tagId)
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 태그가 이미 있습니다.')
    }
    throw error
  }
}

/**
 * 태그 삭제 전: 이 태그가 붙은 모든 메모를 먼저 삭제한 뒤 태그 삭제.
 * (메모에 다른 태그가 있어도 해당 메모 행 전체가 삭제됩니다.)
 */
export async function deleteTagAndLinkedNotes(tagId: string): Promise<void> {
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
}

export function filterTagsByQuery(all: TagRow[], q: string, excludeIds: string[]): TagRow[] {
  const query = normalizeTagInput(q).toLowerCase()
  if (!query) return []
  return all.filter((t) => {
    if (excludeIds.includes(t.id)) return false
    const name = t.name.toLowerCase()
    return name.includes(query) || [...query].some((ch) => name.includes(ch))
  })
}

/** 메인 태그 그리드: 검색어 없으면 전체, 있으면 부분·글자·유사 단어 매칭 */
export function filterTagsByMainSearch(all: TagRow[], q: string): TagRow[] {
  const raw = normalizeTagInput(q)
  if (!raw) {
    return [...all].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }
  const query = raw.toLowerCase()
  return all
    .filter((t) => {
      const name = t.name.toLowerCase()
      if (name.includes(query)) return true
      if ([...query].some((ch) => name.includes(ch))) return true
      if (query.length >= 2 && tagsAreSimilar(t.name, raw)) return true
      return false
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 메인 검색: 메모 본문·출처에 검색어가 포함된 노트 (최신순 유지) */
export function filterNotesByMainSearch(
  notes: NoteWithTags[],
  q: string,
): NoteWithTags[] {
  const raw = normalizeTagInput(q)
  if (!raw) return []
  const needle = raw.toLowerCase()
  return notes.filter((n) => {
    const body = (n.body ?? '').toLowerCase()
    const src = (n.source ?? '').toLowerCase()
    return body.includes(needle) || src.includes(needle)
  })
}
