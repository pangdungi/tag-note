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

function ymdKey(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(year, month - 1, day)
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 검색창 입력을 로컬 날짜 키(YYYY-MM-DD)로. 날짜가 아니면 null */
export function parseSearchDateKey(
  raw: string,
  now: Date = new Date(),
): string | null {
  const compact = raw.trim().replace(/\s+/g, '')
  if (!compact) return null

  let match = compact.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/)
  if (match) {
    return ymdKey(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  match = compact.match(/^(\d{4})년(\d{1,2})월(\d{1,2})일?$/)
  if (match) {
    return ymdKey(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  match = compact.match(/^(\d{1,2})월(\d{1,2})일?$/)
  if (match) {
    return ymdKey(now.getFullYear(), Number(match[1]), Number(match[2]))
  }

  match = compact.match(/^(\d{1,2})[./](\d{1,2})\.?$/)
  if (match) {
    return ymdKey(now.getFullYear(), Number(match[1]), Number(match[2]))
  }

  match = compact.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (match) {
    return ymdKey(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  match = compact.match(/^(\d{2})(\d{2})$/)
  if (match) {
    return ymdKey(now.getFullYear(), Number(match[1]), Number(match[2]))
  }

  return null
}

/** 로컬 날짜 키 → created_at 범위 (ISO) */
export function dateKeyLocalRange(
  dateKey: string,
): { start: string; end: string } | null {
  const parts = dateKey.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [year, month, day] = parts
  const start = new Date(year, month - 1, day)
  const end = new Date(year, month - 1, day + 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { start: start.toISOString(), end: end.toISOString() }
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
