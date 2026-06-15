import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TagComposer, type SelectedTag } from '../components/TagComposer'
import { SourceComposer, type SelectedSource } from '../components/SourceComposer'
import { AddParentTagModal } from '../components/AddParentTagModal'
import { EditSourceModal } from '../components/EditSourceModal'
import { EditParentTagModal } from '../components/EditParentTagModal'
import { EditTagModal } from '../components/EditTagModal'
import { HomeBrowseNavButtons, HomeMobileBrowseFab, type HomeBrowseNavId } from '../components/HomeBrowseNav'
import { HomeSearchResultsRail } from '../components/HomeSearchResultsRail'
import { EditNoteModal } from '../components/EditNoteModal'
import { NoteViewModal } from '../components/NoteViewModal'
import { AddNoteModal } from '../components/AddNoteModal'
import { TagNotesPullStatus } from '../components/TagNotesPullStatus'
import { useAuth } from '../contexts/useAuth'
import {
  createNoteWithTags,
  ensureStarterTagsIfEmpty,
  fetchNoteWithTagsById,
  fetchNotesPage,
  fetchNotesForMainSearch,
  fetchSourcesInUse,
  fetchTags,
  fetchTagParentLinks,
  filterSourcesByQuery,
  filterTagsByMainSearch,
  mapNotesWithRenamedTag,
  mergeSourcesFromNoteIntoAllSources,
  mergeTagsFromNoteIntoAllTags,
  mergeNotesById,
  mapNotesWithClearedSource,
  mapNotesWithRenamedSource,
  noteBodyMatchesMainSearch,
  noteSourceLabel,
  pruneAllOrphanSources,
  supabaseErrorMessage,
  syncNotesStateAfterSourceSelectionPull,
  syncNotesStateAfterTagSelectionPull,
  tagMainSearchScore,
  type PromoteTagToParentResult,
  type NoteWithTags,
  type SourceRow,
  type TagParentLink,
  type TagRow,
} from '../lib/notesApi'
import {
  displayTagName,
  getChildTags,
  getParentTags,
  isBooksRailParentTag,
  isParentTagRailActive,
  normalizeTagInput,
  resolveTagFilterIds,
  formatSpineLabel,
  formatSpineText,
  tagHasChildren,
  TAG_RAIL_INDEX_KO,
  TAG_RAIL_INDEX_EN,
  TAG_RAIL_INDEX_ETC,
  tagRailIndexHasTags,
  tagRailIndexLabel,
  firstTagIdForRailIndexKey,
  resolveAddNoteParentTagId,
  type TagRailIndexKey,
} from '../lib/tagUtils'
import { displaySourceTitle, sourceTitleKey } from '../lib/sourceUtils'
import { useParentRailHorizontalTouch } from '../hooks/useParentRailHorizontalTouch'
import { MemoBodyContent } from '../components/MemoBodyContent'
import { MemoNoteEditor } from '../components/MemoNoteEditor'
import { useLoadingUiMountLog } from '../lib/loadingUiMountLog'
import { isSupabaseConfigured } from '../lib/supabase'
import { AccountModal } from '../components/AccountModal'
import tagIconUrl from '../assets/tag-icon.png'
import addBookIconUrl from '../assets/addbook.png'
import userCircleIconUrl from '../assets/user-circle-icon.png'

const EMPTY_MODAL_SEED_TAGS: SelectedTag[] = []

function ParentTagSpineStat({
  value,
  prefixHash = false,
  ariaLabel,
}: {
  value: number
  prefixHash?: boolean
  ariaLabel: string
}) {
  return (
    <span className="parent-tag-spine-stat" aria-label={ariaLabel}>
      {prefixHash ? `#${value}` : value}
    </span>
  )
}

function formatNoteWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function NoteBoardCard({
  note,
  onView,
  onSourceFilter,
  onTagFilter,
  excludeTagId,
  sourceLink = true,
}: {
  note: NoteWithTags
  onView: (note: NoteWithTags, contextTagId?: string | null) => void
  onSourceFilter?: (sourceId: string) => void
  onTagFilter?: (tagId: string) => void
  /** 클릭한 태그 화면 — 해당 태그 pill 숨김, 다른 태그만 표시 */
  excludeTagId?: string | null
  /** false면 출처를 링크 없이 표시 (태그 뷰) */
  sourceLink?: boolean
}) {
  const tagLinks = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string; color_index: number }[]

  const sorted = [...tagLinks].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
  const visibleTags = excludeTagId
    ? sorted.filter((tg) => tg.id !== excludeTagId)
    : sorted

  const src = noteSourceLabel(note)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''

  return (
    <article
      className={`note-board-card${body ? ' note-board-card--viewable' : ''}`}
      onClick={() => {
        if (body) onView(note, excludeTagId ?? null)
      }}
      onKeyDown={(e) => {
        if (!body) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView(note, excludeTagId ?? null)
        }
      }}
      {...(body ? { role: 'button' as const, tabIndex: 0 } : {})}
    >
      {visibleTags.length > 0 ? (
        <div className="note-board-card-head">
          <div className="note-board-card-tags">
            {visibleTags.map((tg) =>
              onTagFilter ? (
                <button
                  key={tg.id}
                  type="button"
                  className="note-board-tag-pill note-board-tag-pill--link"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTagFilter(tg.id)
                  }}
                >
                  {displayTagName(tg.name)}
                </button>
              ) : (
                <span key={tg.id} className="note-board-tag-pill">
                  {displayTagName(tg.name)}
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}
      <div
        className={`note-board-card-preview${
          !body ? ' note-board-card-preview--empty' : ''
        }`}
      >
        <MemoBodyContent as="span" body={body} emptyLabel="내용 없음" />
      </div>
      <div className="note-board-card-meta">
        {src ? (
          sourceLink && srcId && onSourceFilter ? (
            <button
              type="button"
              className="note-board-card-source note-board-card-source--link"
              onClick={(e) => {
                e.stopPropagation()
                onSourceFilter(srcId)
              }}
            >
              {src}
            </button>
          ) : (
            <span className="note-board-card-source">{src}</span>
          )
        ) : null}
        <time className="note-board-card-time" dateTime={note.created_at}>
          {formatNoteWhen(note.created_at)}
        </time>
      </div>
    </article>
  )
}

type InlineRailNotesPanelProps = {
  tagLabel: string
  tagId: string
  notes: NoteWithTags[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  onView: (note: NoteWithTags, contextTagId?: string | null) => void
  onTagFilter?: (tagId: string) => void
}

function InlineRailNotesPanel({
  tagLabel,
  tagId,
  notes,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onView,
  onTagFilter,
}: InlineRailNotesPanelProps) {
  return (
    <div
      className="parent-tag-child-notes"
      aria-busy={loading}
      aria-label={`${tagLabel} 관련 메모`}
    >
      <TagNotesPullStatus
        active={loading && notes.length === 0}
        hasCachedNotes={false}
      />
      {!loading && notes.length === 0 ? (
        <p className="notes-hint parent-tag-child-notes-empty">
          이 태그가 달린 메모가 아직 없습니다.
        </p>
      ) : notes.length > 0 ? (
        <ul className="note-board-list parent-tag-child-note-list">
          {notes.map((note) => (
            <li key={note.id}>
              <NoteBoardCard
                note={note}
                excludeTagId={tagId}
                onView={onView}
                onTagFilter={onTagFilter}
                sourceLink={false}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {hasMore && notes.length > 0 ? (
        <button
          type="button"
          className="btn note-board-load-more parent-tag-child-load-more"
          disabled={loadingMore || loading}
          onClick={onLoadMore}
        >
          {loadingMore ? '불러오는 중…' : '이 태그 메모 더 보기'}
        </button>
      ) : null}
    </div>
  )
}

type HomeQuickActionButtonsProps = {
  canUseCompose: boolean
  addNoteOpen: boolean
  showAddParentTagCompose: boolean
  searchActive: boolean
  user: ReturnType<typeof useAuth>['user']
  showRailSettings: boolean
  railSettingsLabel: string
  onOpenRailSettings: () => void
  onToggleSearch: () => void
  onToggleAddNote: () => void
  onAddParentTag: () => void
  onOpenAccount: () => void
  mobileBrowseFab?: ReactNode
}

type RailEditContext =
  | { kind: 'parent'; tag: TagRow }
  | { kind: 'tag'; tag: TagRow }
  | { kind: 'source'; source: SourceRow }

function HomeTagGridLoadingHint() {
  useLoadingUiMountLog('HomePage · section.tag-grid-section · loading===true')
  return <p className="notes-hint">불러오는 중…</p>
}

function HomeInlineSearchField({
  inputRef,
  value,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="home-header-search-field">
      <div className="home-search-wrap home-search-wrap--header">
        <svg
          className="home-search-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="home-search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="태그·메모 검색 (이름, 본문, 출처)"
          autoComplete="off"
          spellCheck={false}
          aria-label="태그·메모 검색"
        />
      </div>
    </div>
  )
}

function HomeQuickActionButtons({
  canUseCompose,
  addNoteOpen,
  showAddParentTagCompose,
  searchActive,
  user,
  showRailSettings,
  railSettingsLabel,
  onOpenRailSettings,
  onToggleSearch,
  onToggleAddNote,
  onAddParentTag,
  onOpenAccount,
  mobileBrowseFab,
}: HomeQuickActionButtonsProps) {
  return (
    <>
      {showRailSettings ? (
        <button
          type="button"
          className="btn btn--icon"
          aria-label={railSettingsLabel}
          title={railSettingsLabel}
          disabled={!canUseCompose}
          onClick={onOpenRailSettings}
        >
          <img
            src={tagIconUrl}
            alt=""
            className="btn--icon-img"
            width={20}
            height={20}
            decoding="async"
          />
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn--icon home-search-toggle-btn"
        aria-label={searchActive ? '검색 닫기' : '검색 열기'}
        title={searchActive ? '검색 닫기' : '검색'}
        disabled={!canUseCompose}
        onClick={(e) => {
          onToggleSearch()
          e.currentTarget.blur()
        }}
      >
        <svg
          className="btn--icon-svg"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
      <button
        type="button"
        className={`btn btn--icon${
          !showAddParentTagCompose && addNoteOpen ? ' btn--active' : ''
        }${showAddParentTagCompose ? ' btn--icon-addbook' : ''}`}
        disabled={!canUseCompose}
        aria-label={showAddParentTagCompose ? '상위태그 추가' : '메모 추가 열기'}
        title={showAddParentTagCompose ? '상위태그 추가' : '새 메모'}
        onClick={showAddParentTagCompose ? onAddParentTag : onToggleAddNote}
      >
        {showAddParentTagCompose ? (
          <img
            src={addBookIconUrl}
            alt=""
            className="btn--icon-img btn--icon-img--addbook"
            width={20}
            height={20}
            decoding="async"
          />
        ) : (
          '+'
        )}
      </button>
      {mobileBrowseFab}
      <button
        type="button"
        className="btn btn--icon"
        aria-label="내 계정"
        title="내 계정"
        disabled={!user}
        onClick={onOpenAccount}
      >
        <img
          src={userCircleIconUrl}
          alt=""
          className="btn--icon-img"
          width={20}
          height={20}
          decoding="async"
        />
      </button>
    </>
  )
}

type SelectionPullCacheMeta = { hasMore: boolean }
type SelectionPullResult = { notes: NoteWithTags[]; hasMore: boolean }

function tagPullCacheKey(
  tagId: string,
  nav: HomeBrowseNavId,
  allTags: TagRow[],
  tagParentLinks: TagParentLink[],
): string {
  const filterIds =
    nav === 'books'
      ? resolveTagFilterIds(tagId, allTags, tagParentLinks)
      : [tagId]
  return `${nav}:${tagId}:${[...filterIds].sort().join(',')}:full-tags-v1`
}

function filterLocalNotesForTagPull(
  prev: NoteWithTags[],
  tagId: string,
  nav: HomeBrowseNavId,
  tags: TagRow[],
  tagParentLinks: TagParentLink[],
): NoteWithTags[] {
  const tagIds = new Set(
    nav === 'books'
      ? resolveTagFilterIds(tagId, tags, tagParentLinks)
      : [tagId],
  )
  return prev
    .filter((n) =>
      n.note_tags.some(
        (nt) =>
          tagIds.has(nt.tag_id) ||
          (nt.tags?.id != null && tagIds.has(nt.tags.id)),
      ),
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
}

function filterLocalNotesForSourcePull(
  prev: NoteWithTags[],
  sourceId: string,
  sourceTitle: string | undefined,
): NoteWithTags[] {
  return prev
    .filter((n) => {
      const sid = n.source_id ?? n.sources?.id
      if (sid === sourceId) return true
      if (!sourceTitle || sid) return false
      return sourceTitleKey(noteSourceLabel(n)) === sourceTitleKey(sourceTitle)
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
}

export function HomePage() {
  const { user, signOut, subscription, refreshSubscription } = useAuth()

  const refreshAccountSubscription = useCallback(() => {
    void refreshSubscription()
  }, [refreshSubscription])
  const [tagSearch, setTagSearch] = useState('')
  const [bootstrapTags, setBootstrapTags] = useState<SelectedTag[]>([])
  const [bootstrapBody, setBootstrapBody] = useState('')
  const [bootstrapSource, setBootstrapSource] = useState<SelectedSource | null>(null)
  const [allTags, setAllTags] = useState<TagRow[]>([])
  const [tagParentLinks, setTagParentLinks] = useState<TagParentLink[]>([])
  const [allSources, setAllSources] = useState<SourceRow[]>([])
  const [notes, setNotes] = useState<NoteWithTags[]>([])
  const [tagNotesHasMore, setTagNotesHasMore] = useState(false)
  const [sourceNotesHasMore, setSourceNotesHasMore] = useState(false)
  const [tagNotesLoadingMore, setTagNotesLoadingMore] = useState(false)
  const [sourceNotesLoadingMore, setSourceNotesLoadingMore] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  /** 상위태그 모드 — 하위 태그 메모만 닫아도 펼친 상위 스파인 유지 */
  const [booksRailExpandedParentId, setBooksRailExpandedParentId] = useState<
    string | null
  >(null)
  /** 태그 모드 — 메모만 닫아도 펼친 스파인·검은 배경 유지 */
  const [tagsRailExpandedTagId, setTagsRailExpandedTagId] = useState<
    string | null
  >(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [bootstrapSaving, setBootstrapSaving] = useState(false)
  /** 첫 작성 카드: 저장 검증 안내 */
  const [bootstrapFieldHint, setBootstrapFieldHint] = useState<
    'tags' | 'body' | null
  >(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [addNoteParentTagId, setAddNoteParentTagId] = useState<string | null>(
    null,
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [homeBrowseNav, setHomeBrowseNav] = useState<HomeBrowseNavId>('tags')
  const [mobileBrowseFabOpen, setMobileBrowseFabOpen] = useState(false)

  const [addParentTagRailOpen, setAddParentTagRailOpen] = useState(false)
  const [railEditingTag, setRailEditingTag] = useState<TagRow | null>(null)
  const [railEditingParentTag, setRailEditingParentTag] =
    useState<TagRow | null>(null)
  const [railEditingSource, setRailEditingSource] = useState<SourceRow | null>(
    null,
  )
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<NoteWithTags | null>(null)
  const [viewingNote, setViewingNote] = useState<NoteWithTags | null>(null)
  const [viewingNoteContextTagId, setViewingNoteContextTagId] = useState<
    string | null
  >(null)
  const [viewNoteLoading, setViewNoteLoading] = useState(false)

  /** 이 계정에서 첫 데이터 패치가 끝났는지 — 이후엔 태그 칸 전체「불러오는 중」을 안 띄움 */
  const homeDataInitialLoadDoneRef = useRef(false)

  /** 태그 클릭 시 `syncNotes…`에 넘길 최신 `notes` (비동기 완료 시점 참고용) */
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  /** 태그·출처 선택 풀 — 세션 내 재선택 시 서버 재요청 없이 캐시 표시 */
  const tagPullCacheRef = useRef(new Map<string, SelectionPullCacheMeta>())
  const sourcePullCacheRef = useRef(new Map<string, SelectionPullCacheMeta>())
  const tagPullInFlightRef = useRef(new Map<string, Promise<SelectionPullResult>>())
  const sourcePullInFlightRef = useRef(
    new Map<string, Promise<SelectionPullResult>>(),
  )

  const fetchHomeSnapshot = useCallback(async (uid: string) => {
    const [tags, links, notePage] = await Promise.all([
      fetchTags(),
      fetchTagParentLinks(),
      fetchNotesPage(),
    ])
    const tagsAfterStarter =
      tags.length === 0 ? await ensureStarterTagsIfEmpty(uid) : tags
    try {
      await pruneAllOrphanSources()
    } catch (e) {
      console.warn('[태그노트] 고아 출처 정리 실패', e)
    }
    const sources = await fetchSourcesInUse()
    return {
      tags: tagsAfterStarter,
      tagParentLinks: links,
      sources,
      notes: notePage.notes,
    }
  }, [])

  const loadData = useCallback(
    async (opts?: { showGridLoading?: boolean }) => {
      const uid = user?.id ?? null
      if (!uid) {
        setLoading(false)
        return
      }
      const showGrid =
        opts?.showGridLoading ?? !homeDataInitialLoadDoneRef.current
      if (showGrid) {
        setLoading(true)
      }
      try {
        const { tags, tagParentLinks: links, sources, notes: noteRows } =
          await fetchHomeSnapshot(uid)
        setAllTags(tags)
        setTagParentLinks(links)
        setAllSources(sources)
        setNotes(noteRows)
        setTagNotesHasMore(false)
        setSourceNotesHasMore(false)
        tagPullCacheRef.current.clear()
        sourcePullCacheRef.current.clear()
        setSaveError(null)
        setLoadError(null)
        setSearchError(null)
        homeDataInitialLoadDoneRef.current = true
      } catch (e) {
        console.error('[태그노트] HomePage 초기 불러오기 실패', e)
        setLoadError(
          supabaseErrorMessage(e, '알 수 없는 오류로 불러오지 못했습니다.'),
        )
      } finally {
        if (showGrid) {
          setLoading(false)
        }
      }
    },
    [user?.id, fetchHomeSnapshot],
  )

  /** 태그 동기화 UI — 초기 스냅샷(loadData 성공) 이후 탭 바꿀 때는 표시 안 함 */
  const [tagPullLoading, setTagPullLoading] = useState(false)
  const [sourcePullLoading, setSourcePullLoading] = useState(false)

  /** 메모 검색 — 서버 조회 결과 (검색어·hasMore와 함께 보관) */
  const [searchNotesResult, setSearchNotesResult] = useState<{
    q: string
    notes: NoteWithTags[]
    hasMore: boolean
  } | null>(null)
  const [searchNotesLoading, setSearchNotesLoading] = useState(false)

  const refreshSourcesInUse = useCallback(async () => {
    try {
      await pruneAllOrphanSources()
      const sources = await fetchSourcesInUse()
      setAllSources(sources)
      setSelectedSourceId((cur) =>
        cur && sources.some((s) => s.id === cur) ? cur : null,
      )
    } catch (e) {
      console.warn('[태그노트] 출처 목록 갱신 실패', e)
    }
  }, [])

  const applyNoteCreated = useCallback(
    (note: NoteWithTags, opts?: { replacingId?: string }) => {
      setNotes((prev) => [
        note,
        ...prev.filter(
          (n) => n.id !== note.id && n.id !== opts?.replacingId,
        ),
      ])
      setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
      setAllSources((prev) => mergeSourcesFromNoteIntoAllSources(prev, note))
      tagPullCacheRef.current.clear()
      sourcePullCacheRef.current.clear()
      setTagSearch('')
      setSaveError(null)
    },
    [],
  )

  const applyNoteRemoved = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    tagPullCacheRef.current.clear()
    sourcePullCacheRef.current.clear()
  }, [])

  const applyNoteUpdated = useCallback((note: NoteWithTags) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
    setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
    setAllSources((prev) => mergeSourcesFromNoteIntoAllSources(prev, note))
    tagPullCacheRef.current.clear()
    sourcePullCacheRef.current.clear()
    setSaveError(null)
  }, [])

  const applyNoteDeleted = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    tagPullCacheRef.current.clear()
    sourcePullCacheRef.current.clear()
    setEditingNote((cur) => (cur?.id === noteId ? null : cur))
  }, [])

  /** 실패·동기화 시 서버 기준으로 메모 한 건만 다시 불러옴 (로컬 롤백 없음) */
  const syncNoteFromServer = useCallback(
    async (noteId: string) => {
      try {
        const fresh = await fetchNoteWithTagsById(noteId)
        setNotes((prev) => prev.map((n) => (n.id === noteId ? fresh : n)))
        setEditingNote((cur) => (cur?.id === noteId ? fresh : cur))
      } catch {
        void loadData({ showGridLoading: false })
      }
    },
    [loadData],
  )

  const syncAllFromServer = useCallback(async () => {
    void loadData({ showGridLoading: false })
  }, [loadData])

  const resolveLinkedNoteIds = useCallback((tagId: string) => {
    return notesRef.current
      .filter((n) =>
        n.note_tags.some(
          (nt) => nt.tag_id === tagId || nt.tags?.id === tagId,
        ),
      )
      .map((n) => n.id)
  }, [])

  const applyTagUpdated = useCallback((row: TagRow) => {
    setAllTags((prev) => {
      const next = prev.map((t) => (t.id === row.id ? row : t))
      return [...next].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    })
    setNotes((prev) => mapNotesWithRenamedTag(prev, row.id, row.name, row.color_index))
  }, [])

  const applyTagCreated = useCallback((row: TagRow) => {
    setAllTags((prev) => {
      if (prev.some((t) => t.id === row.id)) {
        return prev.map((t) => (t.id === row.id ? row : t))
      }
      return [...prev, row].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    })
  }, [])

  const applyTagsAssigned = useCallback(
    (rows: TagRow[], parentId?: string) => {
      if (rows.length === 0) return
      setAllTags((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]))
        for (const row of rows) {
          map.set(row.id, row)
        }
        return [...map.values()].sort((a, b) =>
          a.name.localeCompare(b.name, 'ko'),
        )
      })
      if (parentId) {
        setTagParentLinks((prev) => {
          const next = [...prev]
          for (const row of rows) {
            if (
              !next.some(
                (l) =>
                  l.tag_id === row.id && l.parent_tag_id === parentId,
              )
            ) {
              next.push({ tag_id: row.id, parent_tag_id: parentId })
            }
          }
          return next
        })
        tagPullCacheRef.current.clear()
      }
    },
    [],
  )

  const applyChildrenSynced = useCallback(
    (payload: { tags: TagRow[]; links: TagParentLink[] }) => {
      setAllTags(
        [...payload.tags].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      )
      setTagParentLinks(payload.links)
      tagPullCacheRef.current.clear()
    },
    [],
  )

  const applyTagPromoted = useCallback(
    (result: PromoteTagToParentResult) => {
      applyTagUpdated(result.parent)
      applyTagsAssigned(result.assignedChildren)
      tagPullCacheRef.current.clear()

      const parentId = result.parent.id
      setHomeBrowseNav('books')
      setMobileBrowseFabOpen(false)
      setTagsRailExpandedTagId(null)
      setSelectedTagId(null)
      setSelectedSourceId(null)
      setTagNotesHasMore(false)
      setSourceNotesHasMore(false)
      setBooksRailExpandedParentId(parentId)
      setViewingNote(null)
      setRailEditingTag(null)
    },
    [applyTagUpdated, applyTagsAssigned],
  )

  const applyTagDeleted = useCallback(
    (payload: { tagId: string; deletedNoteIds: string[] }) => {
      const { tagId, deletedNoteIds } = payload
      setSelectedTagId((s) => (s === tagId ? null : s))
      setBooksRailExpandedParentId((s) => (s === tagId ? null : s))
      setAllTags((prev) =>
        prev
          .filter((t) => t.id !== tagId)
          .map((t) =>
            t.parent_id === tagId ? { ...t, parent_id: null } : t,
          ),
      )
      setTagParentLinks((prev) =>
        prev.filter(
          (l) => l.tag_id !== tagId && l.parent_tag_id !== tagId,
        ),
      )
      setNotes((prev) => {
        if (deletedNoteIds.length > 0) {
          return prev.filter((n) => !deletedNoteIds.includes(n.id))
        }
        return prev.map((n) => ({
          ...n,
          note_tags: n.note_tags.filter(
            (nt) => (nt.tags?.id ?? nt.tag_id) !== tagId,
          ),
        }))
      })
      tagPullCacheRef.current.clear()
      sourcePullCacheRef.current.clear()
      const unlinkTagFromNote = (note: NoteWithTags): NoteWithTags => ({
        ...note,
        note_tags: note.note_tags.filter(
          (nt) => (nt.tags?.id ?? nt.tag_id) !== tagId,
        ),
      })
      setEditingNote((cur) => {
        if (!cur) return null
        if (deletedNoteIds.includes(cur.id)) return null
        if (deletedNoteIds.length === 0) return unlinkTagFromNote(cur)
        return cur
      })
      setViewingNote((cur) => {
        if (!cur) return null
        if (deletedNoteIds.includes(cur.id)) return null
        if (deletedNoteIds.length === 0) return unlinkTagFromNote(cur)
        return cur
      })
    },
    [],
  )

  const applySourceUpdated = useCallback((row: SourceRow) => {
    setAllSources((prev) =>
      [...prev.map((s) => (s.id === row.id ? row : s))].sort((a, b) =>
        a.title.localeCompare(b.title, 'ko'),
      ),
    )
    setNotes((prev) => mapNotesWithRenamedSource(prev, row.id, row.title))
    sourcePullCacheRef.current.clear()
    setSaveError(null)
  }, [])

  const applySourceDeleted = useCallback(
    (sourceId: string) => {
      const deleted = allSources.find((s) => s.id === sourceId)
      const titleKey = deleted ? sourceTitleKey(deleted.title) : undefined
      setSelectedSourceId((s) => (s === sourceId ? null : s))
      setAllSources((prev) => prev.filter((s) => s.id !== sourceId))
      setNotes((prev) =>
        mapNotesWithClearedSource(prev, sourceId, titleKey),
      )
      sourcePullCacheRef.current.clear()
      tagPullCacheRef.current.clear()
    },
    [allSources],
  )

  useEffect(() => {
    homeDataInitialLoadDoneRef.current = false
  }, [user?.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 초기/세션 전환 시 Supabase 페치
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedTagId) {
      return
    }
    if (
      homeBrowseNav === 'books' &&
      tagHasChildren(selectedTagId, allTags, tagParentLinks) &&
      normalizeTagInput(tagSearch).length === 0 &&
      !selectedSourceId &&
      getParentTags(allTags).length > 0
    ) {
      return
    }
    const uid = user?.id
    if (!uid) {
      return
    }
    const tagIds =
      homeBrowseNav === 'books'
        ? resolveTagFilterIds(selectedTagId, allTags, tagParentLinks)
        : [selectedTagId]
    const cacheKey = tagPullCacheKey(
      selectedTagId,
      homeBrowseNav,
      allTags,
      tagParentLinks,
    )
    const cached = tagPullCacheRef.current.get(cacheKey)
    if (cached) {
      setTagNotesHasMore(cached.hasMore)
      setTagPullLoading(false)
      return
    }
    const localNotes = filterLocalNotesForTagPull(
      notesRef.current,
      selectedTagId,
      homeBrowseNav,
      allTags,
      tagParentLinks,
    )
    setTagPullLoading(localNotes.length === 0)
    let cancelled = false
    let inFlight = tagPullInFlightRef.current.get(cacheKey)
    if (!inFlight) {
      inFlight = syncNotesStateAfterTagSelectionPull(
        notesRef.current,
        selectedTagId,
        { tagIds },
      ).finally(() => {
        if (tagPullInFlightRef.current.get(cacheKey) === inFlight) {
          tagPullInFlightRef.current.delete(cacheKey)
        }
      })
      tagPullInFlightRef.current.set(cacheKey, inFlight)
    }
    void (async () => {
      try {
        const next = await inFlight!
        if (cancelled) {
          return
        }
        setNotes(next.notes)
        setTagNotesHasMore(next.hasMore)
        tagPullCacheRef.current.set(cacheKey, { hasMore: next.hasMore })
        setLoadError(null)
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : '알 수 없는 오류로 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!cancelled) {
          setTagPullLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      setTagPullLoading(false)
    }
  }, [
    selectedTagId,
    user?.id,
    allTags,
    tagParentLinks,
    tagSearch,
    selectedSourceId,
    homeBrowseNav,
  ])

  useEffect(() => {
    if (!selectedSourceId) {
      return
    }
    const uid = user?.id
    if (!uid) {
      return
    }
    const cached = sourcePullCacheRef.current.get(selectedSourceId)
    if (cached) {
      setSourceNotesHasMore(cached.hasMore)
      setSourcePullLoading(false)
      return
    }
    const source = allSources.find((s) => s.id === selectedSourceId)
    const localNotes = filterLocalNotesForSourcePull(
      notesRef.current,
      selectedSourceId,
      source?.title,
    )
    setSourcePullLoading(localNotes.length === 0)
    let cancelled = false
    let inFlight = sourcePullInFlightRef.current.get(selectedSourceId)
    if (!inFlight) {
      inFlight = syncNotesStateAfterSourceSelectionPull(
        notesRef.current,
        selectedSourceId,
      ).finally(() => {
        if (sourcePullInFlightRef.current.get(selectedSourceId) === inFlight) {
          sourcePullInFlightRef.current.delete(selectedSourceId)
        }
      })
      sourcePullInFlightRef.current.set(selectedSourceId, inFlight)
    }
    void (async () => {
      try {
        const next = await inFlight!
        if (cancelled) {
          return
        }
        setNotes(next.notes)
        setSourceNotesHasMore(next.hasMore)
        sourcePullCacheRef.current.set(selectedSourceId, {
          hasMore: next.hasMore,
        })
        setLoadError(null)
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : '알 수 없는 오류로 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!cancelled) {
          setSourcePullLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      setSourcePullLoading(false)
    }
  }, [selectedSourceId, user?.id, allSources])

  const visibleTags = useMemo(
    () => filterTagsByMainSearch(allTags, tagSearch),
    [allTags, tagSearch],
  )

  const searchNormalized = useMemo(
    () => normalizeTagInput(tagSearch).toLowerCase(),
    [tagSearch],
  )

  const hasActiveSearch = searchNormalized.length > 0

  const visibleSources = useMemo(() => {
    if (!hasActiveSearch) return allSources
    return filterSourcesByQuery(allSources, tagSearch)
  }, [allSources, tagSearch, hasActiveSearch])

  const notesMatchingSearch = useMemo(() => {
    if (!hasActiveSearch || selectedTagId || selectedSourceId) return []
    if (searchNotesResult?.q === searchNormalized) {
      return searchNotesResult.notes
    }
    return []
  }, [
    hasActiveSearch,
    selectedTagId,
    selectedSourceId,
    searchNormalized,
    searchNotesResult,
  ])

  const searchParentTagSpines = useMemo(() => {
    if (!hasActiveSearch) return []
    return getParentTags(allTags)
      .filter((t) => tagMainSearchScore(t.name, tagSearch) >= 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [hasActiveSearch, allTags, tagSearch])

  const searchTagSpines = useMemo(() => {
    if (!hasActiveSearch) return []
    const parentIds = new Set(searchParentTagSpines.map((t) => t.id))
    return visibleTags.filter((t) => !parentIds.has(t.id))
  }, [hasActiveSearch, visibleTags, searchParentTagSpines])

  const searchBodyNotes = useMemo(() => {
    if (!hasActiveSearch || selectedTagId || selectedSourceId) return []
    if (searchNotesResult?.q !== searchNormalized) return []
    return notesMatchingSearch.filter((n) =>
      noteBodyMatchesMainSearch(n, tagSearch),
    )
  }, [
    hasActiveSearch,
    selectedTagId,
    selectedSourceId,
    searchNormalized,
    searchNotesResult?.q,
    notesMatchingSearch,
    tagSearch,
  ])

  const searchNotesPending = useMemo(() => {
    if (!hasActiveSearch || selectedTagId || selectedSourceId) return false
    return searchNotesResult?.q !== searchNormalized
  }, [
    hasActiveSearch,
    selectedTagId,
    selectedSourceId,
    searchNotesResult?.q,
    searchNormalized,
  ])

  const searchResultsLoading = searchNotesLoading || searchNotesPending

  const notesForSelectedTag = useMemo(() => {
    if (!selectedTagId) return []
    const tagIds = new Set(
      resolveTagFilterIds(selectedTagId, allTags, tagParentLinks),
    )
    return notes
      .filter((n) =>
        n.note_tags.some(
          (nt) =>
            tagIds.has(nt.tag_id) ||
            (nt.tags?.id != null && tagIds.has(nt.tags.id)),
        ),
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
  }, [notes, selectedTagId, allTags, tagParentLinks])

  const selectedSource = useMemo(() => {
    if (!selectedSourceId) return null
    return allSources.find((x) => x.id === selectedSourceId) ?? null
  }, [allSources, selectedSourceId])

  const notesForSelectedSource = useMemo(() => {
    if (!selectedSourceId) return []
    const sourceTitle = selectedSource?.title
    return notes
      .filter((n) => {
        const sid = n.source_id ?? n.sources?.id
        if (sid === selectedSourceId) return true
        if (!sourceTitle || sid) return false
        return sourceTitleKey(noteSourceLabel(n)) === sourceTitleKey(sourceTitle)
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
  }, [notes, selectedSourceId, selectedSource])

  /** 출처 필터 시 — 해당 출처 메모에 실제로 붙은 태그만 */
  const displayTags = useMemo(() => {
    if (selectedSourceId) {
      const linkedIds = new Set<string>()
      for (const note of notesForSelectedSource) {
        for (const nt of note.note_tags) {
          const id = nt.tags?.id ?? nt.tag_id
          if (id && !id.startsWith('pending-')) {
            linkedIds.add(id)
          }
        }
      }
      return visibleTags.filter((t) => linkedIds.has(t.id))
    }
    if (hasActiveSearch) {
      return visibleTags
    }
    if (selectedTagId && tagHasChildren(selectedTagId, allTags, tagParentLinks)) {
      return visibleTags.filter((t) => t.parent_id === selectedTagId)
    }
    return visibleTags.filter((t) => !t.parent_id)
  }, [
    visibleTags,
    selectedSourceId,
    notesForSelectedSource,
    hasActiveSearch,
    selectedTagId,
    allTags,
  ])

  function clearMainSearch() {
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setSelectedTagId(null)
    setTagNotesHasMore(false)
    setSearchOpen(false)
  }

  function clearTagFilter() {
    setSelectedTagId(null)
    setTagNotesHasMore(false)
    setBooksRailExpandedParentId(null)
    setTagsRailExpandedTagId(null)
  }

  function clearSourceFilter() {
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
  }

  function selectBrowseNav(id: HomeBrowseNavId) {
    setHomeBrowseNav(id)
    setMobileBrowseFabOpen(false)
    clearTagFilter()
    clearSourceFilter()
    clearMainSearch()
  }

  function toggleMobileBrowseFab() {
    setMobileBrowseFabOpen((open) => !open)
  }

  function toggleTagSelect(tagId: string) {
    const tag = allTags.find((t) => t.id === tagId)
    const isBooksParent =
      homeBrowseNav === 'books' &&
      Boolean(tag && isBooksRailParentTag(tag, allTags))

    if (isBooksParent) {
      if (booksRailExpandedParentId === tagId) {
        setBooksRailExpandedParentId(null)
        setSelectedTagId(null)
        setTagNotesHasMore(false)
      } else {
        setBooksRailExpandedParentId(tagId)
        setSelectedTagId((cur) => {
          if (!cur) return null
          const curTag = allTags.find((t) => t.id === cur)
          if (curTag?.parent_id === tagId) return cur
          return null
        })
      }
      setViewingNote(null)
      return
    }

    if (homeBrowseNav === 'books' && tag?.parent_id) {
      setBooksRailExpandedParentId(tag.parent_id)
    }

    if (homeBrowseNav === 'tags') {
      if (selectedTagId === tagId || tagsRailExpandedTagId === tagId) {
        setTagsRailExpandedTagId(null)
        setSelectedTagId(null)
        setTagNotesHasMore(false)
        setViewingNote(null)
        return
      }
      setTagsRailExpandedTagId(tagId)
    }

    setSelectedTagId((cur) => {
      const next = cur === tagId ? null : tagId
      if (next !== null && homeBrowseNav !== 'links') {
        setSelectedSourceId(null)
        setSourceNotesHasMore(false)
      }
      return next
    })
    setViewingNote(null)
  }

  function toggleSourceSelect(sourceId: string) {
    setSelectedSourceId((cur) => {
      const next = cur === sourceId ? null : sourceId
      if (next !== null) {
        setTagSearch('')
        setSearchNotesResult(null)
        setSearchError(null)
        setSelectedTagId(null)
        setTagNotesHasMore(false)
        setSearchOpen(false)
      }
      return next
    })
    setViewingNote(null)
    setViewingNoteContextTagId(null)
  }

  function openSourceViewFromNote(sourceId: string) {
    setHomeBrowseNav('links')
    setMobileBrowseFabOpen(false)
    setSelectedSourceId(sourceId)
    setSelectedTagId(null)
    setTagNotesHasMore(false)
    setBooksRailExpandedParentId(null)
    setTagsRailExpandedTagId(null)
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setSearchOpen(false)
    setViewingNote(null)
    setViewingNoteContextTagId(null)
    setViewNoteLoading(false)
  }

  function openTagViewFromNote(tagId: string) {
    setHomeBrowseNav('tags')
    setMobileBrowseFabOpen(false)
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
    setBooksRailExpandedParentId(null)
    setTagsRailExpandedTagId(tagId)
    setSelectedTagId(tagId)
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setSearchOpen(false)
    setViewingNote(null)
    setViewingNoteContextTagId(null)
    setViewNoteLoading(false)
  }

  function filterBySourceFromCard(sourceId: string) {
    setSelectedSourceId(sourceId)
    setSelectedTagId(null)
    setTagNotesHasMore(false)
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setSearchOpen(false)
    setViewingNote(null)
  }

  const openViewNote = useCallback(
    (note: NoteWithTags, contextTagId?: string | null) => {
      setViewingNote(note)
      setViewingNoteContextTagId(contextTagId ?? null)
    },
    [],
  )

  function openEditNote(note: NoteWithTags) {
    setViewingNote(null)
    setViewingNoteContextTagId(null)
    setEditingNote(note)
  }

  async function loadMoreTagNotes() {
    if (!selectedTagId || tagNotesLoadingMore || !tagNotesHasMore) return
    const tagNotes = notesForSelectedTag
    const before = tagNotes[tagNotes.length - 1]?.created_at
    if (!before) return
    setTagNotesLoadingMore(true)
    try {
      const result = await syncNotesStateAfterTagSelectionPull(
        notesRef.current,
        selectedTagId,
        {
          before,
        tagIds:
          homeBrowseNav === 'books'
            ? resolveTagFilterIds(selectedTagId, allTags, tagParentLinks)
            : [selectedTagId],
        },
      )
      setNotes(result.notes)
      setTagNotesHasMore(result.hasMore)
      tagPullCacheRef.current.set(
        tagPullCacheKey(
          selectedTagId,
          homeBrowseNav,
          allTags,
          tagParentLinks,
        ),
        { hasMore: result.hasMore },
      )
    } catch (e) {
      setLoadError(
        supabaseErrorMessage(e, '알 수 없는 오류로 불러오지 못했습니다.'),
      )
    } finally {
      setTagNotesLoadingMore(false)
    }
  }

  async function loadMoreSourceNotes() {
    if (!selectedSourceId || sourceNotesLoadingMore || !sourceNotesHasMore) return
    const sourceNotes = notesForSelectedSource
    const before = sourceNotes[sourceNotes.length - 1]?.created_at
    if (!before) return
    setSourceNotesLoadingMore(true)
    try {
      const result = await syncNotesStateAfterSourceSelectionPull(
        notesRef.current,
        selectedSourceId,
        { before },
      )
      setNotes(result.notes)
      setSourceNotesHasMore(result.hasMore)
      sourcePullCacheRef.current.set(selectedSourceId, {
        hasMore: result.hasMore,
      })
    } catch (e) {
      setLoadError(
        supabaseErrorMessage(e, '알 수 없는 오류로 불러오지 못했습니다.'),
      )
    } finally {
      setSourceNotesLoadingMore(false)
    }
  }

  const selectedTag = useMemo(() => {
    if (!selectedTagId) return null
    return allTags.find((x) => x.id === selectedTagId) ?? null
  }, [allTags, selectedTagId])

  const selectedTagIsParent = Boolean(
    selectedTagId && tagHasChildren(selectedTagId, allTags, tagParentLinks),
  )

  const tagsForGrid = useMemo(() => {
    if (!selectedTagId) return displayTags
    const idx = displayTags.findIndex((t) => t.id === selectedTagId)
    if (idx <= 0) return displayTags
    const picked = displayTags[idx]
    return [
      picked,
      ...displayTags.slice(0, idx),
      ...displayTags.slice(idx + 1),
    ]
  }, [displayTags, selectedTagId])

  const sourcesForGrid = useMemo(() => {
    if (!selectedSourceId) return visibleSources
    const idx = visibleSources.findIndex((s) => s.id === selectedSourceId)
    if (idx <= 0) return visibleSources
    const picked = visibleSources[idx]
    return [
      picked,
      ...visibleSources.slice(0, idx),
      ...visibleSources.slice(idx + 1),
    ]
  }, [visibleSources, selectedSourceId])

  const selectedTagBtnRef = useRef<HTMLButtonElement>(null)
  const selectedSourceBtnRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!selectedTagId) return
    selectedTagBtnRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedTagId, tagsForGrid])

  useEffect(() => {
    if (!selectedSourceId) return
    selectedSourceBtnRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedSourceId, sourcesForGrid])

  useEffect(() => {
    if (!hasActiveSearch || selectedTagId || selectedSourceId || !user?.id) {
      setSearchNotesResult(null)
      setSearchNotesLoading(false)
      setSearchError(null)
      return
    }
    const qKey = searchNormalized
    const qRaw = tagSearch
    const tagIds = visibleTags.map((t) => t.id)
    let cancelled = false
    setSearchNotesLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchNotesForMainSearch(qRaw, tagIds)
          if (cancelled) return
          setSearchNotesResult({
            q: qKey,
            notes: result.notes,
            hasMore: result.hasMore,
          })
          setNotes((prev) => mergeNotesById(prev, result.notes))
          setSearchError(null)
        } catch (e) {
          if (!cancelled) {
            console.error('[태그노트] HomePage 메모 검색 실패', { q: qRaw }, e)
            setSearchError(
              supabaseErrorMessage(e, '알 수 없는 오류로 검색하지 못했습니다.'),
            )
          }
        } finally {
          if (!cancelled) {
            setSearchNotesLoading(false)
          }
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    hasActiveSearch,
    selectedTagId,
    selectedSourceId,
    searchNormalized,
    tagSearch,
    visibleTags,
    user?.id,
  ])

  useEffect(() => {
    if (!selectedTagId) return
    if (!allTags.some((t) => t.id === selectedTagId)) {
      setSelectedTagId(null)
    }
  }, [selectedTagId, allTags])

  useEffect(() => {
    if (!selectedSourceId) return
    if (!allSources.some((s) => s.id === selectedSourceId)) {
      setSelectedSourceId(null)
    }
  }, [selectedSourceId, allSources])

  async function handleBootstrapSave() {
    if (!user?.id) return
    setSaveError(null)
    if (bootstrapTags.length === 0) {
      setBootstrapFieldHint('tags')
      return
    }
    if (!bootstrapBody.trim()) {
      setBootstrapFieldHint('body')
      return
    }
    setBootstrapFieldHint(null)
    const saveBody = bootstrapBody
    const saveTags = bootstrapTags.map((t) => t.name)
    const saveSource = bootstrapSource?.title ?? ''
    setBootstrapSaving(true)
    try {
      const note = await createNoteWithTags(
        saveBody,
        saveTags,
        user.id,
        [...allTags],
        saveSource,
        [...allSources],
      )
      setBootstrapBody('')
      setBootstrapSource(null)
      setBootstrapTags([])
      applyNoteCreated(note)
    } catch (e) {
      console.error('[태그노트] HomePage 첫 메모 저장 실패', {
        bodyLength: saveBody.length,
        sourceLength: saveSource.length,
        tagCount: saveTags.length,
      }, e)
      setSaveError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setBootstrapSaving(false)
    }
  }

  const showBootstrap = allTags.length === 0 && !loading

  const showSearchRail =
    !showBootstrap &&
    !loading &&
    !loadError &&
    hasActiveSearch &&
    !selectedTagId &&
    !selectedSourceId

  const bootstrapSaveReady =
    bootstrapTags.length > 0 && bootstrapBody.trim().length > 0

  const canUseCompose = !showBootstrap && !loading && !loadError

  const parentTagsForRail = useMemo(
    () => getParentTags(allTags),
    [allTags],
  )

  const tagsForTagModeRail = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [allTags],
  )

  const sourcesForLinkModeRail = useMemo(
    () =>
      [...allSources].sort((a, b) =>
        a.title.localeCompare(b.title, 'ko'),
      ),
    [allSources],
  )

  const tagsForLinkModeSource = useMemo(() => {
    if (homeBrowseNav !== 'links' || !selectedSourceId) return []
    const linkedIds = new Set<string>()
    for (const note of notesForSelectedSource) {
      for (const nt of note.note_tags) {
        const id = nt.tags?.id ?? nt.tag_id
        if (id) linkedIds.add(id)
      }
    }
    return allTags
      .filter((t) => linkedIds.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [homeBrowseNav, selectedTagId, notesForSelectedSource, allTags])

  const parentChildCounts = useMemo(() => {
    const childrenByParent = new Map<string, Set<string>>()
    const add = (parentId: string, childId: string) => {
      let set = childrenByParent.get(parentId)
      if (!set) {
        set = new Set()
        childrenByParent.set(parentId, set)
      }
      set.add(childId)
    }
    for (const t of allTags) {
      if (t.parent_id) add(t.parent_id, t.id)
    }
    for (const l of tagParentLinks) {
      add(l.parent_tag_id, l.tag_id)
    }
    const map = new Map<string, number>()
    for (const [parentId, set] of childrenByParent) {
      map.set(parentId, set.size)
    }
    return map
  }, [allTags, tagParentLinks])

  const tagMemoCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const note of notes) {
      for (const nt of note.note_tags) {
        const id = nt.tags?.id ?? nt.tag_id
        if (!id) continue
        map.set(id, (map.get(id) ?? 0) + 1)
      }
    }
    return map
  }, [notes])

  const sourceTagCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const source of allSources) {
      const tagIds = new Set<string>()
      for (const note of notes) {
        const sid = note.source_id ?? note.sources?.id
        const matches =
          sid === source.id ||
          (!sid &&
            sourceTitleKey(noteSourceLabel(note)) ===
              sourceTitleKey(source.title))
        if (!matches) continue
        for (const nt of note.note_tags) {
          const id = nt.tags?.id ?? nt.tag_id
          if (id) tagIds.add(id)
        }
      }
      map.set(source.id, tagIds.size)
    }
    return map
  }, [allSources, notes])

  const notesForLinkModeTag = useMemo(() => {
    if (homeBrowseNav !== 'links' || !selectedTagId || !selectedSourceId) {
      return []
    }
    const sourceTitle = selectedSource?.title
    return notesForSelectedTag.filter((n) => {
      const sid = n.source_id ?? n.sources?.id
      if (sid === selectedSourceId) return true
      if (!sourceTitle || sid) return false
      return sourceTitleKey(noteSourceLabel(n)) === sourceTitleKey(sourceTitle)
    })
  }, [
    homeBrowseNav,
    selectedTagId,
    selectedSourceId,
    notesForSelectedTag,
    selectedSource,
  ])

  const showBrowseRail =
    !showBootstrap &&
    !loading &&
    !loadError &&
    !hasActiveSearch &&
    (homeBrowseNav === 'books'
      ? true
      : homeBrowseNav === 'tags'
        ? tagsForTagModeRail.length > 0
        : sourcesForLinkModeRail.length > 0)

  const showRailViewport =
    !showBootstrap && (showBrowseRail || showSearchRail)

  const browseRailAriaLabel =
    homeBrowseNav === 'books'
      ? '상위 태그'
      : homeBrowseNav === 'tags'
        ? '태그'
        : '출처'

  const showTagRailIndex =
    homeBrowseNav === 'tags' &&
    showBrowseRail &&
    tagsForTagModeRail.length > 0

  const scrollToTagRailIndex = useCallback(
    (key: TagRailIndexKey) => {
      const tagId = firstTagIdForRailIndexKey(tagsForTagModeRail, key)
      if (!tagId) return
      const slot = tagSpineSlotRefs.current.get(tagId)
      const scroller =
        parentTagRailScrollRef.current ?? parentTagRailSectionRef.current
      if (!slot || !scroller) return
      const scrollerRect = scroller.getBoundingClientRect()
      const slotRect = slot.getBoundingClientRect()
      scroller.scrollTo({
        left: scroller.scrollLeft + slotRect.left - scrollerRect.left - 16,
        behavior: 'smooth',
      })
    },
    [tagsForTagModeRail],
  )

  const showHomeTagGrid = Boolean(
    (selectedTagId || selectedSourceId) && !showBrowseRail && !showSearchRail,
  )
  const showHomeSourceGrid = Boolean(selectedSourceId) && !showBrowseRail
  const showHomeCompactHeader =
    !showHomeTagGrid && !showHomeSourceGrid && !showBrowseRail

  /** 태그·출처 필터 pill 바 (검색은 헤더 입력창) */
  const showHomeFilterBar = Boolean(
    !showBrowseRail && (selectedSource || selectedTag),
  )

  const showHeaderSearch = searchOpen

  /** 책(상위태그) 뷰에서 상위 미선택 시 + → 북스파인(상위태그 추가) */
  const showAddParentTagCompose =
    homeBrowseNav === 'books' &&
    !hasActiveSearch &&
    resolveAddNoteParentTagId(
      homeBrowseNav,
      selectedTagId,
      booksRailExpandedParentId,
      allTags,
    ) === null

  const selectedOpenSpineId = useMemo(() => {
    if (homeBrowseNav === 'books') return booksRailExpandedParentId
    if (homeBrowseNav === 'tags') return selectedTagId
    if (homeBrowseNav === 'links') return selectedSourceId
    return null
  }, [
    homeBrowseNav,
    booksRailExpandedParentId,
    selectedTagId,
    selectedSourceId,
  ])

  const railSectionOpen = Boolean(selectedOpenSpineId)

  const railEditContext = useMemo((): RailEditContext | null => {
    if (!showBrowseRail || hasActiveSearch) return null

    if (homeBrowseNav === 'books') {
      if (selectedTagId) {
        const tag = allTags.find((t) => t.id === selectedTagId)
        if (tag) return { kind: 'tag', tag }
      }
      if (booksRailExpandedParentId) {
        const parent = allTags.find((t) => t.id === booksRailExpandedParentId)
        if (parent) return { kind: 'parent', tag: parent }
      }
      return null
    }

    if (homeBrowseNav === 'tags') {
      const tagId = selectedTagId ?? tagsRailExpandedTagId
      if (!tagId) return null
      const tag = allTags.find((t) => t.id === tagId)
      return tag ? { kind: 'tag', tag } : null
    }

    if (homeBrowseNav === 'links') {
      if (selectedTagId) {
        const tag = allTags.find((t) => t.id === selectedTagId)
        if (tag) return { kind: 'tag', tag }
      }
      if (selectedSourceId) {
        const source = allSources.find((s) => s.id === selectedSourceId)
        if (source) return { kind: 'source', source }
      }
      return null
    }

    return null
  }, [
    showBrowseRail,
    hasActiveSearch,
    homeBrowseNav,
    selectedTagId,
    tagsRailExpandedTagId,
    booksRailExpandedParentId,
    selectedSourceId,
    allTags,
    allSources,
  ])

  const railSettingsLabel = useMemo(() => {
    if (!railEditContext) return '설정'
    if (railEditContext.kind === 'parent') return '상위태그 수정'
    if (railEditContext.kind === 'tag') return '태그 수정'
    return '출처 수정'
  }, [railEditContext])

  const openRailSettings = useCallback(() => {
    if (!railEditContext) return
    if (railEditContext.kind === 'parent') {
      setRailEditingParentTag(railEditContext.tag)
    } else if (railEditContext.kind === 'tag') {
      setRailEditingTag(railEditContext.tag)
    } else {
      setRailEditingSource(railEditContext.source)
    }
  }, [railEditContext])

  const parentTagRailSectionRef = useRef<HTMLElement>(null)
  const parentTagRailScrollRef = useRef<HTMLDivElement>(null)
  const tagSpineSlotRefs = useRef(new Map<string, HTMLLIElement>())
  const openTracksRef = useRef<HTMLDivElement>(null)
  const openParentSpineRef = useRef<HTMLLIElement>(null)

  useLayoutEffect(() => {
    const section = parentTagRailSectionRef.current
    if (!section) return

    const scroller = parentTagRailScrollRef.current ?? section

    if (!selectedOpenSpineId) {
      section.style.removeProperty('--parent-open-slot-width')
      return
    }

    const applyOpenWidth = () => {
      section.style.setProperty(
        '--parent-open-slot-width',
        `${scroller.clientWidth}px`,
      )
    }

    const alignOpenSpine = () => {
      const openSlot = openParentSpineRef.current
      if (!openSlot) return
      const scrollerRect = scroller.getBoundingClientRect()
      const slotRect = openSlot.getBoundingClientRect()
      scroller.scrollLeft += slotRect.left - scrollerRect.left
    }

    applyOpenWidth()
    alignOpenSpine()

    const ro = new ResizeObserver(() => {
      applyOpenWidth()
      alignOpenSpine()
    })
    ro.observe(scroller)

    return () => {
      ro.disconnect()
      section.style.removeProperty('--parent-open-slot-width')
    }
  }, [selectedOpenSpineId])

  useLayoutEffect(() => {
    const scroller =
      parentTagRailScrollRef.current ?? parentTagRailSectionRef.current
    scroller?.scrollTo({ left: 0 })
  }, [homeBrowseNav])

  useParentRailHorizontalTouch(
    parentTagRailScrollRef,
    openTracksRef,
    railSectionOpen,
  )

  function openAddParentTag() {
    if (!canUseCompose) return
    setAddParentTagRailOpen(true)
  }

  function openAddNote() {
    if (!canUseCompose) return
    setAddNoteParentTagId(
      resolveAddNoteParentTagId(
        homeBrowseNav,
        selectedTagId,
        booksRailExpandedParentId,
        allTags,
      ),
    )
    setAddNoteOpen(true)
  }

  function closeAddNote() {
    setAddNoteOpen(false)
    setAddNoteParentTagId(null)
  }

  function toggleAddNote() {
    if (!addNoteOpen) openAddNote()
  }

  function toggleSearch() {
    if (searchOpen || hasActiveSearch) {
      clearMainSearch()
      searchInputRef.current?.blur()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return
    }
    setSearchOpen(true)
  }

  useEffect(() => {
    if (!searchOpen) return
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [searchOpen])

  function handleSearchChange(v: string) {
    if (normalizeTagInput(v).length > 0) {
      setSelectedTagId(null)
      setSelectedSourceId(null)
    }
    setTagSearch(v)
  }

  function handleSearchTagSelect(tagId: string) {
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
    setSelectedTagId(tagId)
    const tag = allTags.find((t) => t.id === tagId)
    if (tag?.parent_id) {
      setBooksRailExpandedParentId(tag.parent_id)
    } else if (tagHasChildren(tagId, allTags, tagParentLinks)) {
      setBooksRailExpandedParentId(tagId)
    } else {
      setBooksRailExpandedParentId(null)
    }
    if (homeBrowseNav === 'tags') {
      setTagsRailExpandedTagId(tagId)
    }
    setViewingNote(null)
    setSearchOpen(false)
  }

  return (
    <div className="home-layout">
      {loadError ? (
        <div className="setup-banner" role="status">
          <p className="setup-banner-title">데이터를 불러오지 못했습니다</p>
          <p className="setup-banner-text">
            Supabase 연결·테이블·권한(RLS) 문제일 수 있습니다. 대시보드{' '}
            <strong>SQL Editor</strong>에서{' '}
            <code className="inline-code">supabase/migrations/001_notes_tags.sql</code>
            {' '}및{' '}
            <code className="inline-code">009_sources.sql</code>
            {' '}을 실행했는지,{' '}
            <code className="inline-code">.env</code>의 URL·키가 같은 프로젝트인지
            확인하세요.
          </p>
          <p className="setup-banner-tech">{loadError}</p>
          <button
            type="button"
            className="setup-retry"
            disabled={loading}
            onClick={() => void loadData({ showGridLoading: true })}
          >
            다시 불러오기
          </button>
        </div>
      ) : null}

      {searchError && !loadError ? (
        <div className="setup-banner" role="alert">
          <p className="setup-banner-title">검색하지 못했습니다</p>
          <p className="setup-banner-text">{searchError}</p>
          <button
            type="button"
            className="setup-retry"
            onClick={() => setSearchError(null)}
          >
            닫기
          </button>
        </div>
      ) : null}

      {saveError && !showBootstrap ? (
        <div className="setup-banner" role="alert">
          <p className="setup-banner-title">저장하지 못했습니다</p>
          <p className="setup-banner-text">{saveError}</p>
          <button
            type="button"
            className="setup-retry"
            onClick={() => setSaveError(null)}
          >
            닫기
          </button>
        </div>
      ) : null}

      <div
        className={
          showRailViewport ? 'home-rail-viewport' : 'home-page-shell'
        }
      >
        {!showBootstrap ? (
          <>
            <header
            className={[
              showHomeFilterBar
                ? 'home-top-tag-search home-top-tag-search--with-note-board'
                : 'home-top-tag-search',
              !showHomeTagGrid ? 'home-top-tag-search--no-tag-grid' : '',
              showHomeCompactHeader ? 'home-top-tag-search--compact' : '',
              'home-top-tag-search--icons-only',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="home-top-tag-search-inner">
              <div
                className={`home-header-actions-row${
                  showHeaderSearch ? ' home-header-actions-row--search' : ''
                }`}
              >
                <div className="home-desktop-browse-nav">
                  <HomeBrowseNavButtons
                    activeId={homeBrowseNav}
                    disabled={!canUseCompose}
                    onSelect={selectBrowseNav}
                  />
                </div>
                {showHeaderSearch ? (
                  <div className="home-header-search-slot">
                    <HomeInlineSearchField
                      inputRef={searchInputRef}
                      value={tagSearch}
                      onChange={handleSearchChange}
                    />
                  </div>
                ) : null}
                <div className="home-desktop-quick-actions">
                  <HomeQuickActionButtons
                    canUseCompose={canUseCompose}
                    addNoteOpen={addNoteOpen}
                    showAddParentTagCompose={showAddParentTagCompose}
                    searchActive={searchOpen || hasActiveSearch}
                    user={user}
                    showRailSettings={Boolean(railEditContext)}
                    railSettingsLabel={railSettingsLabel}
                    onOpenRailSettings={openRailSettings}
                    onToggleSearch={() => toggleSearch()}
                    onToggleAddNote={() => toggleAddNote()}
                    onAddParentTag={() => openAddParentTag()}
                    onOpenAccount={() => setAccountModalOpen(true)}
                  />
                </div>
              </div>
              {showHomeFilterBar ? (
                <div
                  className={`home-filter-mode${
                    selectedTag && !showBrowseRail
                      ? ' home-filter-mode--tag'
                      : ' home-filter-mode--source'
                  }`}
                  role="status"
                >
                  {selectedTag && !showBrowseRail ? (
                    <>
                      <div className="home-filter-mode-tag-main">
                        {hasActiveSearch ? (
                          <span className="home-filter-mode-search-context">
                            「{normalizeTagInput(tagSearch)}」 검색
                          </span>
                        ) : null}
                        <span className="home-filter-mode-tag-pill">
                          {displayTagName(selectedTag.name)}
                        </span>
                        <span className="home-filter-mode-tag-desc">
                          {selectedTagIsParent
                            ? '이 상위 태그·하위 태그가 붙은 메모'
                            : '이 태그가 붙은 메모만'}
                        </span>
                      </div>
                      <div className="home-filter-mode-clear-group">
                        <button
                          type="button"
                          className="home-filter-mode-clear"
                          onClick={() => clearTagFilter()}
                        >
                          {hasActiveSearch ? '태그 선택 해제' : '필터 해제'}
                        </button>
                        {hasActiveSearch ? (
                          <button
                            type="button"
                            className="home-filter-mode-clear"
                            onClick={() => clearMainSearch()}
                          >
                            검색 지우기
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : selectedSource ? (
                    <>
                      <div className="home-filter-mode-source-main">
                        <span
                          className="home-filter-mode-source-pill"
                          title={displaySourceTitle(selectedSource.title)}
                        >
                          <span className="home-filter-mode-source-icon" aria-hidden="true">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                          </span>
                          <span className="home-filter-mode-source-pill-label">
                            {displaySourceTitle(selectedSource.title)}
                          </span>
                        </span>
                        <span className="home-filter-mode-source-desc">
                          이 출처의 메모만
                        </span>
                      </div>
                      <button
                        type="button"
                        className="home-filter-mode-clear"
                        onClick={() => clearSourceFilter()}
                      >
                        필터 해제
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              <section
                className={`tag-grid-section${
                  showHomeTagGrid ? '' : ' tag-grid-section--hidden'
                }`}
                aria-hidden={showHomeTagGrid ? undefined : true}
                aria-label={
                  selectedSourceId ? '이 출처 메모의 태그' : '내 태그'
                }
              >
                {loading || (selectedSourceId && sourcePullLoading) ? (
                  <HomeTagGridLoadingHint />
                ) : displayTags.length === 0 ? (
                  <p className="notes-hint">
                    {selectedSourceId
                      ? '이 출처 메모에 붙은 태그가 없습니다.'
                      : hasActiveSearch
                        ? notesMatchingSearch.length > 0
                          ? '태그 검색 결과는 없습니다. 아래 메모·출처 결과를 확인해 보세요.'
                          : '검색 결과가 없습니다.'
                        : '태그가 없습니다.'}
                  </p>
                ) : (
                  <ul
                    className={
                      selectedTagId || selectedSourceId || addNoteOpen
                        ? `tag-grid tag-grid--single-row${
                            selectedTagId || selectedSourceId
                              ? ' tag-grid--has-selection'
                              : ''
                          }`
                        : 'tag-grid'
                    }
                  >
                    {tagsForGrid.map((t) => (
                      <li key={t.id}>
                        {selectedSourceId && !selectedTagId ? (
                          <span className="tag-grid-pill tag-grid-pill--context">
                            {displayTagName(t.name)}
                          </span>
                        ) : (
                          <button
                            ref={
                              selectedTagId === t.id ? selectedTagBtnRef : undefined
                            }
                            type="button"
                            className={`tag-grid-pill${
                              selectedTagId === t.id ? ' tag-grid-pill--selected' : ''
                            }`}
                            aria-pressed={selectedTagId === t.id}
                            aria-current={selectedTagId === t.id ? 'true' : undefined}
                            onClick={() => toggleTagSelect(t.id)}
                          >
                            {displayTagName(t.name)}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {showHomeSourceGrid &&
              !loading &&
              allSources.length > 0 &&
              !selectedTagId ? (
                <section className="source-grid-section" aria-label="내 출처">
                  <h3 className="source-grid-heading">내 출처</h3>
                  <ul
                    className={
                      selectedSourceId || addNoteOpen
                        ? `source-grid source-grid--single-row${
                            selectedSourceId ? ' source-grid--has-selection' : ''
                          }`
                        : 'source-grid'
                    }
                  >
                    {sourcesForGrid.map((s) => (
                      <li key={s.id}>
                        <button
                          ref={
                            selectedSourceId === s.id
                              ? selectedSourceBtnRef
                              : undefined
                          }
                          type="button"
                          className={`source-grid-pill${
                            selectedSourceId === s.id
                              ? ' source-grid-pill--selected'
                              : ''
                          }`}
                          title={displaySourceTitle(s.title)}
                          aria-pressed={selectedSourceId === s.id}
                          aria-current={selectedSourceId === s.id ? 'true' : undefined}
                          onClick={() => toggleSourceSelect(s.id)}
                        >
                          <span className="source-grid-pill-icon" aria-hidden="true">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                          </span>
                          <span className="source-grid-pill-label">
                            {displaySourceTitle(s.title)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              </div>
            </header>

            <nav
              className="home-mobile-quick-actions"
              aria-label="빠른 작업"
            >
              <HomeQuickActionButtons
                canUseCompose={canUseCompose}
                addNoteOpen={addNoteOpen}
                showAddParentTagCompose={showAddParentTagCompose}
                searchActive={searchOpen || hasActiveSearch}
                user={user}
                showRailSettings={Boolean(railEditContext)}
                railSettingsLabel={railSettingsLabel}
                onOpenRailSettings={openRailSettings}
                onToggleSearch={() => toggleSearch()}
                onToggleAddNote={() => toggleAddNote()}
                onAddParentTag={() => openAddParentTag()}
                onOpenAccount={() => setAccountModalOpen(true)}
                mobileBrowseFab={
                  <HomeMobileBrowseFab
                    open={mobileBrowseFabOpen}
                    activeId={homeBrowseNav}
                    disabled={!canUseCompose}
                    onToggle={toggleMobileBrowseFab}
                    onSelect={selectBrowseNav}
                  />
                }
              />
            </nav>
          </>
        ) : null}

        <main
          className={`home-main home-main--tags${
            showBootstrap ? ' home-main--bootstrap' : ''
          }${showBrowseRail || showSearchRail ? ' home-main--parent-rail-hero' : ''}`}
        >
          {showBootstrap ? (
            <section className="bootstrap-card" aria-label="첫 태그·메모 만들기">
              <p className="bootstrap-lead">
                아직 태그가 없습니다. 아래에서 태그와 메모를 만들면 목록에
                표시됩니다.
              </p>
              <div className={loadError ? 'composer-disabled-wrap' : undefined}>
                <div className="composer-stack">
                  <TagComposer
                    allTags={allTags}
                    selected={bootstrapTags}
                    onChange={(next) => {
                      setBootstrapTags(next)
                      setBootstrapFieldHint((h) => (h === 'tags' ? null : h))
                    }}
                    hint={
                      bootstrapFieldHint === 'tags' ? (
                        <p className="composer-field-hint" role="status">
                          태그를 추가해 주세요.
                        </p>
                      ) : undefined
                    }
                  />
                  <div className="composer-field">
                    <label className="composer-label" htmlFor="bootstrap-note">
                      메모
                    </label>
                    <MemoNoteEditor
                      id="bootstrap-note"
                      value={bootstrapBody}
                      onChange={(next) => {
                        setBootstrapBody(next)
                        setBootstrapFieldHint((h) =>
                          h === 'body' ? null : h,
                        )
                      }}
                      source={bootstrapSource?.title ?? ''}
                      onSourceChange={(title) => {
                        const t = title.trim()
                        setBootstrapSource(t ? { title: t } : null)
                      }}
                      placeholder="내용을 입력하세요"
                      rows={5}
                      disabled={!!loadError}
                    />
                    {bootstrapFieldHint === 'body' ? (
                      <p className="composer-field-hint" role="status">
                        메모를 입력해 주세요.
                      </p>
                    ) : null}
                  </div>
                  <SourceComposer
                    allSources={allSources}
                    selected={bootstrapSource}
                    onChange={setBootstrapSource}
                  />
                </div>
              </div>
              {saveError ? <p className="composer-error">{saveError}</p> : null}
              <button
                type="button"
                className={`btn btn--emphasis btn--block composer-save${
                  bootstrapSaveReady ? ' btn--composer-ready' : ''
                }`}
                disabled={loading || !!loadError || bootstrapSaving}
                onClick={() => void handleBootstrapSave()}
              >
                {bootstrapSaving ? '저장 중…' : '저장'}
              </button>
            </section>
          ) : null}

          {showBrowseRail ? (
            <section
              ref={parentTagRailSectionRef}
              className={`parent-tag-rail-section${
                showTagRailIndex ? ' parent-tag-rail-section--with-index' : ''
              }${railSectionOpen ? ' parent-tag-rail-section--open' : ''}`}
              aria-label={browseRailAriaLabel}
            >
              {showTagRailIndex ? (
                <nav
                  className="tag-rail-index"
                  aria-label="태그 목록 빠른 이동"
                >
                  <div className="tag-rail-index-group">
                    {TAG_RAIL_INDEX_ETC.map((key) => {
                      const hasTags = tagRailIndexHasTags(
                        tagsForTagModeRail,
                        key,
                      )
                      const label = tagRailIndexLabel(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`tag-rail-index-item${
                            hasTags ? '' : ' tag-rail-index-item--empty'
                          }`}
                          disabled={!hasTags}
                          aria-label="숫자·기호로 시작하는 태그"
                          onClick={() => scrollToTagRailIndex(key)}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <span className="tag-rail-index-divider" aria-hidden="true" />
                  <div className="tag-rail-index-group">
                    {TAG_RAIL_INDEX_KO.map((key) => {
                      const hasTags = tagRailIndexHasTags(
                        tagsForTagModeRail,
                        key,
                      )
                      const label = tagRailIndexLabel(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`tag-rail-index-item${
                            hasTags ? '' : ' tag-rail-index-item--empty'
                          }`}
                          disabled={!hasTags}
                          aria-label={`${label}로 시작하는 태그`}
                          onClick={() => scrollToTagRailIndex(key)}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <span className="tag-rail-index-divider" aria-hidden="true" />
                  <div className="tag-rail-index-group">
                    {TAG_RAIL_INDEX_EN.map((key) => {
                      const hasTags = tagRailIndexHasTags(
                        tagsForTagModeRail,
                        key,
                      )
                      const label = tagRailIndexLabel(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`tag-rail-index-item${
                            hasTags ? '' : ' tag-rail-index-item--empty'
                          }`}
                          disabled={!hasTags}
                          aria-label={`${label}로 시작하는 태그`}
                          onClick={() => scrollToTagRailIndex(key)}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </nav>
              ) : null}
              <div ref={parentTagRailScrollRef} className="parent-tag-rail-scroll">
              <ul className="parent-tag-rail">
                {homeBrowseNav === 'books'
                  ? parentTagsForRail.map((t) => {
                      const isOpen = booksRailExpandedParentId === t.id
                      const active = isParentTagRailActive(
                        t.id,
                        selectedTagId,
                        allTags,
                        tagParentLinks,
                      )
                      const spineSelected = isOpen || active
                      const children = isOpen
                        ? getChildTags(t.id, allTags, tagParentLinks)
                        : []
                      const childCount = parentChildCounts.get(t.id) ?? 0
                      return (
                        <li
                          key={t.id}
                          ref={isOpen ? openParentSpineRef : undefined}
                          className={`parent-tag-spine-slot${
                            isOpen ? ' parent-tag-spine-slot--open' : ''
                          }`}
                        >
                          <div className="parent-tag-spine-group">
                            <div
                              className={`parent-tag-card${
                                spineSelected ? ' parent-tag-card--selected' : ''
                              }${isOpen ? ' parent-tag-card--expanded' : ''}`}
                            >
                              <button
                                type="button"
                                className="parent-tag-card-body"
                                aria-pressed={spineSelected}
                                aria-current={spineSelected ? 'true' : undefined}
                                aria-expanded={isOpen}
                                aria-label={displayTagName(t.name)}
                                title={displayTagName(t.name)}
                                onClick={() => toggleTagSelect(t.id)}
                              >
                                <span className="parent-tag-card-label">
                                  {formatSpineLabel(t.name)}
                                </span>
                              </button>
                              <ParentTagSpineStat
                                value={childCount}
                                ariaLabel={`하위 태그 ${childCount}개`}
                              />
                            </div>
                            {isOpen ? (
                              <div
                                ref={openTracksRef}
                                className="parent-tag-inline-tracks"
                                aria-label={`${displayTagName(t.name)} 하위 태그`}
                              >
                                {children.length > 0 ? (
                                  <ul className="parent-tag-child-list">
                                    {children.map((child) => {
                                      const childActive =
                                        selectedTagId === child.id
                                      const showChildNotes =
                                        childActive &&
                                        !tagHasChildren(
                                          child.id,
                                          allTags,
                                          tagParentLinks,
                                        )
                                      return (
                                        <li
                                          key={child.id}
                                          className="parent-tag-child-block"
                                        >
                                          <button
                                            type="button"
                                            className={`parent-tag-child-item${
                                              childActive
                                                ? ' parent-tag-child-item--selected'
                                                : ''
                                            }`}
                                            aria-pressed={childActive}
                                            aria-expanded={showChildNotes}
                                            onClick={() =>
                                              toggleTagSelect(child.id)
                                            }
                                          >
                                            <span className="parent-tag-child-label">
                                              {displayTagName(child.name)}
                                            </span>
                                          </button>
                                          {showChildNotes ? (
                                            <InlineRailNotesPanel
                                              tagLabel={displayTagName(
                                                child.name,
                                              )}
                                              tagId={child.id}
                                              notes={notesForSelectedTag}
                                              loading={tagPullLoading}
                                              hasMore={tagNotesHasMore}
                                              loadingMore={tagNotesLoadingMore}
                                              onLoadMore={() =>
                                                void loadMoreTagNotes()
                                              }
                                              onView={openViewNote}
                                              onTagFilter={openTagViewFromNote}
                                            />
                                          ) : null}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                ) : (
                                  <p className="parent-tag-child-empty">
                                    하위 태그가 없습니다.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })
                  : null}
                {homeBrowseNav === 'tags'
                  ? tagsForTagModeRail.map((t) => {
                      const isOpen = selectedTagId === t.id
                      const showNotes = isOpen
                      const memoCount = tagMemoCounts.get(t.id) ?? 0
                      return (
                        <li
                          key={t.id}
                          ref={(el) => {
                            if (el) tagSpineSlotRefs.current.set(t.id, el)
                            else tagSpineSlotRefs.current.delete(t.id)
                            if (isOpen) openParentSpineRef.current = el
                          }}
                          className={`parent-tag-spine-slot${
                            isOpen ? ' parent-tag-spine-slot--open' : ''
                          }`}
                        >
                          <div className="parent-tag-spine-group">
                            <div
                              className={`parent-tag-card${
                                isOpen ? ' parent-tag-card--selected' : ''
                              }${isOpen ? ' parent-tag-card--expanded' : ''}`}
                            >
                              <button
                                type="button"
                                className="parent-tag-card-body"
                                aria-pressed={isOpen}
                                aria-current={isOpen ? 'true' : undefined}
                                aria-expanded={isOpen}
                                aria-label={displayTagName(t.name)}
                                title={displayTagName(t.name)}
                                onClick={() => toggleTagSelect(t.id)}
                              >
                                <span className="parent-tag-card-label">
                                  {formatSpineLabel(t.name)}
                                </span>
                              </button>
                              <ParentTagSpineStat
                                value={memoCount}
                                ariaLabel={`메모 ${memoCount}개`}
                              />
                            </div>
                            {isOpen ? (
                              <div
                                ref={showNotes ? openTracksRef : undefined}
                                className="parent-tag-inline-tracks"
                                aria-label={`${displayTagName(t.name)} 관련 메모`}
                              >
                                {showNotes ? (
                                  <InlineRailNotesPanel
                                    tagLabel={displayTagName(t.name)}
                                    tagId={t.id}
                                    notes={notesForSelectedTag}
                                    loading={tagPullLoading}
                                    hasMore={tagNotesHasMore}
                                    loadingMore={tagNotesLoadingMore}
                                    onLoadMore={() => void loadMoreTagNotes()}
                                    onView={openViewNote}
                                    onTagFilter={openTagViewFromNote}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })
                  : null}
                {homeBrowseNav === 'links'
                  ? sourcesForLinkModeRail.map((s) => {
                      const isOpen = selectedSourceId === s.id
                      const sourceTags = isOpen ? tagsForLinkModeSource : []
                      const tagCount = sourceTagCounts.get(s.id) ?? 0
                      return (
                        <li
                          key={s.id}
                          ref={isOpen ? openParentSpineRef : undefined}
                          className={`parent-tag-spine-slot${
                            isOpen ? ' parent-tag-spine-slot--open' : ''
                          }`}
                        >
                          <div className="parent-tag-spine-group">
                            <div
                              className={`parent-tag-card${
                                isOpen ? ' parent-tag-card--selected' : ''
                              }${isOpen ? ' parent-tag-card--expanded' : ''}`}
                            >
                              <button
                                type="button"
                                className="parent-tag-card-body"
                                aria-pressed={isOpen}
                                aria-current={isOpen ? 'true' : undefined}
                                aria-expanded={isOpen}
                                aria-label={displaySourceTitle(s.title)}
                                title={displaySourceTitle(s.title)}
                                onClick={() => toggleSourceSelect(s.id)}
                              >
                                <span className="parent-tag-card-label">
                                  {formatSpineText(displaySourceTitle(s.title))}
                                </span>
                              </button>
                              <ParentTagSpineStat
                                value={tagCount}
                                prefixHash
                                ariaLabel={`태그 ${tagCount}개`}
                              />
                            </div>
                            {isOpen ? (
                              <div
                                ref={openTracksRef}
                                className="parent-tag-inline-tracks"
                                aria-label={`${displaySourceTitle(s.title)} 관련 태그`}
                              >
                                {sourcePullLoading && sourceTags.length === 0 ? (
                                  <p className="notes-hint parent-tag-child-empty">
                                    불러오는 중…
                                  </p>
                                ) : sourceTags.length > 0 ? (
                                  <ul className="parent-tag-child-list">
                                    {sourceTags.map((tag) => {
                                      const tagActive = selectedTagId === tag.id
                                      const showTagNotes = tagActive
                                      return (
                                        <li
                                          key={tag.id}
                                          className="parent-tag-child-block"
                                        >
                                          <button
                                            type="button"
                                            className={`parent-tag-child-item${
                                              tagActive
                                                ? ' parent-tag-child-item--selected'
                                                : ''
                                            }`}
                                            aria-pressed={tagActive}
                                            aria-expanded={showTagNotes}
                                            onClick={() =>
                                              toggleTagSelect(tag.id)
                                            }
                                          >
                                            <span className="parent-tag-child-label">
                                              {displayTagName(tag.name)}
                                            </span>
                                          </button>
                                          {showTagNotes ? (
                                            <InlineRailNotesPanel
                                              tagLabel={displayTagName(tag.name)}
                                              tagId={tag.id}
                                              notes={notesForLinkModeTag}
                                              loading={tagPullLoading}
                                              hasMore={tagNotesHasMore}
                                              loadingMore={tagNotesLoadingMore}
                                              onLoadMore={() =>
                                                void loadMoreTagNotes()
                                              }
                                              onView={openViewNote}
                                              onTagFilter={openTagViewFromNote}
                                            />
                                          ) : null}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                ) : (
                                  <p className="parent-tag-child-empty">
                                    이 출처 메모에 붙은 태그가 없습니다.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })
                  : null}
              </ul>
              </div>
            </section>
          ) : null}

          {showSearchRail ? (
            <HomeSearchResultsRail
              parentTags={searchParentTagSpines}
              tags={searchTagSpines}
              bodyNotes={searchBodyNotes}
              loading={searchResultsLoading}
              onSelectTag={handleSearchTagSelect}
              onViewNote={openViewNote}
            />
          ) : null}

          {!showBootstrap && selectedTagId && !showBrowseRail ? (
            <section
              className="note-board-section"
              aria-busy={tagPullLoading}
              aria-label={
                selectedTag
                  ? `${displayTagName(selectedTag.name)} 관련 메모`
                  : '선택한 태그의 메모'
              }
            >
              <TagNotesPullStatus
                active={tagPullLoading && notesForSelectedTag.length === 0}
                hasCachedNotes={false}
              />
              {!tagPullLoading && notesForSelectedTag.length === 0 ? (
                <p className="notes-hint note-board-empty">
                  이 태그가 달린 메모가 아직 없습니다.
                </p>
              ) : notesForSelectedTag.length === 0 ? null : (
                <ul className="note-board-list">
                  {notesForSelectedTag.map((note) => (
                    <li key={note.id}>
                      <NoteBoardCard
                        note={note}
                        onView={(n) => openViewNote(n, selectedTagId)}
                        onTagFilter={openTagViewFromNote}
                        sourceLink={false}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {tagNotesHasMore && notesForSelectedTag.length > 0 ? (
                <button
                  type="button"
                  className="btn note-board-load-more"
                  disabled={tagNotesLoadingMore || tagPullLoading}
                  onClick={() => void loadMoreTagNotes()}
                >
                  {tagNotesLoadingMore ? '불러오는 중…' : '이 태그 메모 더 보기'}
                </button>
              ) : null}
            </section>
          ) : null}

          {!showBootstrap && selectedSourceId && !showBrowseRail ? (
            <section
              className="note-board-section"
              aria-busy={sourcePullLoading}
              aria-label={
                selectedSource
                  ? `${displaySourceTitle(selectedSource.title)} 관련 메모`
                  : '선택한 출처의 메모'
              }
            >
              <TagNotesPullStatus
                active={sourcePullLoading && notesForSelectedSource.length === 0}
                hasCachedNotes={false}
              />
              {!sourcePullLoading && notesForSelectedSource.length === 0 ? (
                <p className="notes-hint note-board-empty">
                  이 출처의 메모가 아직 없습니다.
                </p>
              ) : notesForSelectedSource.length === 0 ? null : (
                <ul className="note-board-list">
                  {notesForSelectedSource.map((note) => (
                    <li key={note.id}>
                      <NoteBoardCard
                        note={note}
                        onView={(n) => openViewNote(n, selectedTagId)}
                        onSourceFilter={filterBySourceFromCard}
                        onTagFilter={openTagViewFromNote}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {sourceNotesHasMore && notesForSelectedSource.length > 0 ? (
                <button
                  type="button"
                  className="btn note-board-load-more"
                  disabled={sourceNotesLoadingMore || sourcePullLoading}
                  onClick={() => void loadMoreSourceNotes()}
                >
                  {sourceNotesLoadingMore ? '불러오는 중…' : '이 출처 메모 더 보기'}
                </button>
              ) : null}
            </section>
          ) : null}
        </main>
      </div>

      {user ? (
        <AddNoteModal
          open={addNoteOpen}
          onClose={() => closeAddNote()}
          initialTags={EMPTY_MODAL_SEED_TAGS}
          parentTagId={addNoteParentTagId}
          parentTagName={
            addNoteParentTagId
              ? allTags.find((t) => t.id === addNoteParentTagId)?.name ?? null
              : null
          }
          allTags={allTags}
          allSources={allSources}
          userId={user.id}
          onSaved={applyNoteCreated}
          onSaveFailed={async (tempId) => {
            applyNoteRemoved(tempId)
            await syncAllFromServer()
          }}
          onSaveError={(message) => setSaveError(message)}
        />
      ) : null}

      <EditTagModal
        open={railEditingTag !== null}
        tag={railEditingTag}
        tags={allTags}
        onClose={() => setRailEditingTag(null)}
        onTagUpdated={applyTagUpdated}
        onTagDeleted={applyTagDeleted}
        onTagsPromoted={applyTagPromoted}
        resolveLinkedNoteIds={resolveLinkedNoteIds}
        onTagError={(message) => setSaveError(message)}
        onSyncFromServer={syncAllFromServer}
        onSourcesChanged={refreshSourcesInUse}
      />

      {user ? (
        <AddParentTagModal
          open={addParentTagRailOpen}
          userId={user.id}
          onClose={() => setAddParentTagRailOpen(false)}
          onCreated={(row) => applyTagCreated({ ...row, is_parent: true })}
          onError={(message) => setSaveError(message)}
        />
      ) : null}

      <EditParentTagModal
        open={railEditingParentTag !== null}
        tag={railEditingParentTag}
        tags={allTags}
        tagParentLinks={tagParentLinks}
        onClose={() => setRailEditingParentTag(null)}
        onTagUpdated={applyTagUpdated}
        onTagDeleted={applyTagDeleted}
        onChildrenSynced={(payload) => {
          applyChildrenSynced(payload)
          const parentId = railEditingParentTag?.id
          if (parentId) {
            setBooksRailExpandedParentId(parentId)
            setHomeBrowseNav('books')
          }
        }}
        onTagError={(message) => setSaveError(message)}
        onSyncFromServer={syncAllFromServer}
        onSourcesChanged={refreshSourcesInUse}
      />

      <EditSourceModal
        open={railEditingSource !== null}
        source={railEditingSource}
        onClose={() => setRailEditingSource(null)}
        onSourceUpdated={applySourceUpdated}
        onSourceDeleted={applySourceDeleted}
        onSourceError={(message) => setSaveError(message)}
        onSyncFromServer={syncAllFromServer}
      />

      {user ? (
        <AccountModal
          open={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          user={user}
          subscription={subscription}
          subscriptionEnabled={isSupabaseConfigured}
          onAfterOpen={refreshAccountSubscription}
          onSignOut={signOut}
        />
      ) : null}

      {user ? (
        <NoteViewModal
          open={viewingNote !== null}
          note={viewingNote}
          primaryTagId={viewingNoteContextTagId}
          loading={viewNoteLoading}
          onClose={() => {
            setViewingNote(null)
            setViewingNoteContextTagId(null)
            setViewNoteLoading(false)
          }}
          onEdit={openEditNote}
          onSourceFilter={openSourceViewFromNote}
          onTagFilter={openTagViewFromNote}
        />
      ) : null}

      {user ? (
        <EditNoteModal
          open={editingNote !== null}
          onClose={() => setEditingNote(null)}
          note={editingNote}
          allTags={allTags}
          allSources={allSources}
          userId={user.id}
          onNoteUpdated={applyNoteUpdated}
          onUpdateError={(message) => setSaveError(message)}
          onSyncNoteFromServer={syncNoteFromServer}
          onNoteDeleted={applyNoteDeleted}
          onSourcesChanged={refreshSourcesInUse}
        />
      ) : null}
    </div>
  )
}
