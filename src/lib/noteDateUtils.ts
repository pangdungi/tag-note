import type { NoteWithTags } from './notesApi'

/** 메모 created_at → 로컬 날짜 키 (YYYY-MM-DD) */
export function noteDateKey(createdAt: string): string {
  try {
    const d = new Date(createdAt)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return ''
  }
}

export function formatNoteDateLabel(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return dateKey
  const [y, m, d] = parts
  try {
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(
      new Date(y, m - 1, d),
    )
  } catch {
    return dateKey
  }
}

export type NotesByDateGroup = {
  dateKey: string
  label: string
  notes: NoteWithTags[]
}

export function compareNotesOldestFirst(
  a: { created_at: string },
  b: { created_at: string },
): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

export function sortNotesOldestFirst<T extends { created_at: string }>(
  rows: T[],
): T[] {
  return [...rows].sort(compareNotesOldestFirst)
}

/** 날짜별 묶음 — 오래된 날짜·메모가 위, 최신이 아래 */
export function groupNotesByDate(notes: NoteWithTags[]): NotesByDateGroup[] {
  const map = new Map<string, NoteWithTags[]>()
  for (const note of notes) {
    const key = noteDateKey(note.created_at)
    if (!key) continue
    const bucket = map.get(key) ?? []
    bucket.push(note)
    map.set(key, bucket)
  }
  return [...map.entries()]
    .map(([dateKey, dayNotes]) => ({
      dateKey,
      label: formatNoteDateLabel(dateKey),
      notes: sortNotesOldestFirst(dayNotes),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}
