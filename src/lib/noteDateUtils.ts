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

/** 최신 날짜부터 묶음 */
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
      notes: dayNotes.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}
