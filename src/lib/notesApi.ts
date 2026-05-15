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
