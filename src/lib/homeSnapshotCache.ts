import type {
  NoteWithTags,
  SourceRow,
  TagParentLink,
  TagRow,
} from './notesApi'

const CACHE_VERSION = 2
const KEY_PREFIX = 'tag-note-home-snapshot-v'

export type HomeSnapshotCache = {
  v: number
  cachedAt: string
  tags: TagRow[]
  tagParentLinks: TagParentLink[]
  sources: SourceRow[]
  notes: NoteWithTags[]
  tagMemoCounts: Record<string, number>
  sourceTagCounts: Record<string, number>
}

function cacheKey(userId: string): string {
  return `${KEY_PREFIX}${CACHE_VERSION}:${userId}`
}

function isCountMap(value: unknown): value is Record<string, number> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readHomeSnapshotCache(userId: string): HomeSnapshotCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as HomeSnapshotCache
    if (parsed.v !== CACHE_VERSION) return null
    if (
      !Array.isArray(parsed.tags) ||
      !Array.isArray(parsed.tagParentLinks) ||
      !Array.isArray(parsed.sources) ||
      !Array.isArray(parsed.notes) ||
      !isCountMap(parsed.tagMemoCounts) ||
      !isCountMap(parsed.sourceTagCounts)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeHomeSnapshotCache(
  userId: string,
  data: Omit<HomeSnapshotCache, 'v' | 'cachedAt'>,
): void {
  try {
    const payload: HomeSnapshotCache = {
      v: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      ...data,
    }
    sessionStorage.setItem(cacheKey(userId), JSON.stringify(payload))
  } catch (e) {
    console.warn('[태그노트] 홈 스냅샷 캐시 저장 실패', e)
  }
}

export function clearHomeSnapshotCache(userId?: string): void {
  try {
    if (userId) {
      sessionStorage.removeItem(cacheKey(userId))
      return
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(KEY_PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}
