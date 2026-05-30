import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TagComposer, type SelectedTag } from '../components/TagComposer'
import { SourceComposer, type SelectedSource } from '../components/SourceComposer'
import { TagManageModal } from '../components/TagManageModal'
import { AccountModal } from '../components/AccountModal'
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
  filterSourcesByQuery,
  filterTagsByMainSearch,
  mapNotesWithRenamedTag,
  mergeSourcesFromNoteIntoAllSources,
  mergeTagsFromNoteIntoAllTags,
  mergeNotesById,
  noteSourceLabel,
  pruneAllOrphanSources,
  supabaseErrorMessage,
  syncNotesStateAfterSourceSelectionPull,
  syncNotesStateAfterTagSelectionPull,
  type NoteWithTags,
  type SourceRow,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput, TAG_COLOR_COUNT } from '../lib/tagUtils'
import { displaySourceTitle, sourceTitleKey } from '../lib/sourceUtils'
import { MemoBodyContent } from '../components/MemoBodyContent'
import { MemoNoteEditor } from '../components/MemoNoteEditor'
import { useLoadingUiMountLog } from '../lib/loadingUiMountLog'
import { isSupabaseConfigured } from '../lib/supabase'
import tagIconUrl from '../assets/tag-icon.png'
import userCircleIconUrl from '../assets/user-circle-icon.png'

const EMPTY_MODAL_SEED_TAGS: SelectedTag[] = []

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
}: {
  note: NoteWithTags
  onView: (note: NoteWithTags) => void
  onSourceFilter?: (sourceId: string) => void
}) {
  const tagLinks = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string; color_index: number }[]

  const sorted = [...tagLinks].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )

  const src = noteSourceLabel(note)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''
  const showViewHint = Boolean(note.bodyIsPreview) && body.length > 0

  return (
    <article
      className={`note-board-card${showViewHint ? ' note-board-card--viewable' : ''}`}
      onClick={() => {
        if (body) onView(note)
      }}
      onKeyDown={(e) => {
        if (!body) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView(note)
        }
      }}
      {...(body ? { role: 'button' as const, tabIndex: 0 } : {})}
    >
      <div className="note-board-card-head">
        <div className="note-board-card-tags">
          {sorted.map((tg) => (
            <span
              key={tg.id}
              className={`note-board-tag-pill tag-tone-${tg.color_index % TAG_COLOR_COUNT}`}
            >
              {displayTagName(tg.name)}
            </span>
          ))}
        </div>
      </div>
      <MemoBodyContent
        as="p"
        body={body}
        className={`note-board-card-preview${
          !body ? ' note-board-card-preview--empty' : ''
        }${showViewHint ? ' note-board-card-preview--clamped' : ''}`}
        emptyLabel="내용 없음"
      />
      {showViewHint ? (
        <p className="note-board-card-view-hint">클릭하여 전체 보기</p>
      ) : null}
      <div className="note-board-card-meta">
        {src ? (
          srcId && onSourceFilter ? (
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

type HomeQuickActionButtonsProps = {
  canUseCompose: boolean
  addNoteOpen: boolean
  user: ReturnType<typeof useAuth>['user']
  onOpenTagManage: () => void
  onToggleAddNote: () => void
  onOpenAccount: () => void
}

function HomeTagGridLoadingHint() {
  useLoadingUiMountLog('HomePage · section.tag-grid-section · loading===true')
  return <p className="notes-hint">불러오는 중…</p>
}

function HomeQuickActionButtons({
  canUseCompose,
  addNoteOpen,
  user,
  onOpenTagManage,
  onToggleAddNote,
  onOpenAccount,
}: HomeQuickActionButtonsProps) {
  return (
    <>
      <button
        type="button"
        className="btn btn--icon"
        aria-label="태그 관리 열기"
        title="태그 관리"
        disabled={!canUseCompose}
        onClick={onOpenTagManage}
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
      <button
        type="button"
        className={`btn btn--icon${addNoteOpen ? ' btn--active' : ''}`}
        disabled={!canUseCompose}
        aria-label="메모 추가 열기"
        title="새 메모"
        onClick={onToggleAddNote}
      >
        +
      </button>
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
  const [allSources, setAllSources] = useState<SourceRow[]>([])
  const [notes, setNotes] = useState<NoteWithTags[]>([])
  const [tagNotesHasMore, setTagNotesHasMore] = useState(false)
  const [sourceNotesHasMore, setSourceNotesHasMore] = useState(false)
  const [tagNotesLoadingMore, setTagNotesLoadingMore] = useState(false)
  const [sourceNotesLoadingMore, setSourceNotesLoadingMore] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
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

  const [tagManageOpen, setTagManageOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<NoteWithTags | null>(null)
  const [viewingNote, setViewingNote] = useState<NoteWithTags | null>(null)
  const [viewNoteLoading, setViewNoteLoading] = useState(false)

  /** 이 계정에서 첫 데이터 패치가 끝났는지 — 이후엔 태그 칸 전체「불러오는 중」을 안 띄움 */
  const homeDataInitialLoadDoneRef = useRef(false)

  /** 태그 클릭 시 `syncNotes…`에 넘길 최신 `notes` (비동기 완료 시점 참고용) */
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  const fetchHomeSnapshot = useCallback(async (uid: string) => {
    const [tags, notePage] = await Promise.all([fetchTags(), fetchNotesPage()])
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
        const { tags, sources, notes: noteRows } = await fetchHomeSnapshot(uid)
        setAllTags(tags)
        setAllSources(sources)
        setNotes(noteRows)
        setTagNotesHasMore(false)
        setSourceNotesHasMore(false)
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
      setTagSearch('')
      setSaveError(null)
    },
    [],
  )

  const applyNoteRemoved = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }, [])

  const applyNoteUpdated = useCallback((note: NoteWithTags) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
    setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
    setAllSources((prev) => mergeSourcesFromNoteIntoAllSources(prev, note))
    setSaveError(null)
  }, [])

  const applyNoteDeleted = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
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

  const applyTagDeleted = useCallback(
    (payload: { tagId: string; deletedNoteIds: string[] }) => {
      const { tagId, deletedNoteIds } = payload
      setSelectedTagId((s) => (s === tagId ? null : s))
      setAllTags((prev) => prev.filter((t) => t.id !== tagId))
      setNotes((prev) => prev.filter((n) => !deletedNoteIds.includes(n.id)))
      setEditingNote((cur) =>
        cur && deletedNoteIds.includes(cur.id) ? null : cur,
      )
    },
    [],
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
    const uid = user?.id
    if (!uid) {
      return
    }
    let cancelled = false
    const showTagPullSpinner = !homeDataInitialLoadDoneRef.current
    if (showTagPullSpinner) {
      setTagPullLoading(true)
    }
    void (async () => {
      try {
        const next = await syncNotesStateAfterTagSelectionPull(
          notesRef.current,
          selectedTagId,
        )
        if (cancelled) {
          return
        }
        setNotes(next.notes)
        setTagNotesHasMore(next.hasMore)
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
        if (!cancelled && showTagPullSpinner) {
          setTagPullLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      if (showTagPullSpinner) {
        setTagPullLoading(false)
      }
    }
  }, [selectedTagId, user?.id])

  useEffect(() => {
    if (!selectedSourceId) {
      return
    }
    const uid = user?.id
    if (!uid) {
      return
    }
    let cancelled = false
    const showPullSpinner = !homeDataInitialLoadDoneRef.current
    if (showPullSpinner) {
      setSourcePullLoading(true)
    }
    void (async () => {
      try {
        const next = await syncNotesStateAfterSourceSelectionPull(
          notesRef.current,
          selectedSourceId,
        )
        if (cancelled) {
          return
        }
        setNotes(next.notes)
        setSourceNotesHasMore(next.hasMore)
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
        if (!cancelled && showPullSpinner) {
          setSourcePullLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      if (showPullSpinner) {
        setSourcePullLoading(false)
      }
    }
  }, [selectedSourceId, user?.id])

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

  const searchHasMore =
    hasActiveSearch &&
    searchNotesResult?.q === searchNormalized &&
    searchNotesResult.hasMore

  const notesForSelectedTag = useMemo(() => {
    if (!selectedTagId) return []
    return notes
      .filter((n) =>
        n.note_tags.some(
          (nt) => nt.tag_id === selectedTagId || nt.tags?.id === selectedTagId,
        ),
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
  }, [notes, selectedTagId])

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
    if (!selectedSourceId) return visibleTags
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
  }, [visibleTags, selectedSourceId, notesForSelectedSource])

  function clearMainSearch() {
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
  }

  function clearTagFilter() {
    setSelectedTagId(null)
    setTagNotesHasMore(false)
  }

  function clearSourceFilter() {
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
  }

  function toggleTagSelect(tagId: string) {
    setSelectedTagId((cur) => {
      const next = cur === tagId ? null : tagId
      if (next !== null) {
        setTagSearch('')
        setSearchNotesResult(null)
        setSearchError(null)
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
      }
      return next
    })
    setViewingNote(null)
  }

  function filterBySourceFromCard(sourceId: string) {
    setSelectedSourceId(sourceId)
    setSelectedTagId(null)
    setTagNotesHasMore(false)
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setViewingNote(null)
  }

  const openViewNote = useCallback((note: NoteWithTags) => {
    setViewingNote(note)
    if (!note.bodyIsPreview) return

    setViewNoteLoading(true)
    void (async () => {
      try {
        const full = await fetchNoteWithTagsById(note.id)
        setNotes((prev) => mergeNotesById(prev, [full]))
        setViewingNote(full)
      } catch (e) {
        console.error('[태그노트] 메모 전체 본문 불러오기 실패', note.id, e)
        setViewingNote(null)
      } finally {
        setViewNoteLoading(false)
      }
    })()
  }, [])

  function openEditNote(note: NoteWithTags) {
    setViewingNote(null)
    if (!note.bodyIsPreview) {
      setEditingNote(note)
      return
    }
    void (async () => {
      try {
        const full = await fetchNoteWithTagsById(note.id)
        setNotes((prev) => mergeNotesById(prev, [full]))
        setEditingNote(full)
      } catch (e) {
        console.error('[태그노트] 메모 전체 본문 불러오기 실패', note.id, e)
        setEditingNote(note)
      }
    })()
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
        { before },
      )
      setNotes(result.notes)
      setTagNotesHasMore(result.hasMore)
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

  const bootstrapSaveReady =
    bootstrapTags.length > 0 && bootstrapBody.trim().length > 0

  const canUseCompose = !showBootstrap && !loading && !loadError

  function openAddNote() {
    if (!canUseCompose) return
    setAddNoteOpen(true)
  }

  function closeAddNote() {
    setAddNoteOpen(false)
  }

  function toggleAddNote() {
    if (!addNoteOpen) openAddNote()
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

      <>
        {!showBootstrap ? (
          <>
            <header
            className={
              selectedTagId || selectedSourceId || searchNormalized.length > 0
                ? 'home-top-tag-search home-top-tag-search--with-note-board'
                : 'home-top-tag-search'
            }
          >
            <div className="home-top-tag-search-inner">
              <div className="home-tag-search-row" role="search">
                  <div className="home-search-wrap">
                    <span className="sr-only">태그·메모 검색</span>
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
                      id="home-tag-search-input"
                      type="search"
                      className="home-search-input"
                      value={tagSearch}
                      onChange={(e) => {
                        const v = e.target.value
                        if (normalizeTagInput(v).length > 0) {
                          setSelectedTagId(null)
                          setSelectedSourceId(null)
                        }
                        setTagSearch(v)
                      }}
                      placeholder="태그·메모 검색 (이름, 본문, 출처)"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="home-desktop-quick-actions">
                    <HomeQuickActionButtons
                      canUseCompose={canUseCompose}
                      addNoteOpen={addNoteOpen}
                      user={user}
                      onOpenTagManage={() => setTagManageOpen(true)}
                      onToggleAddNote={() => toggleAddNote()}
                      onOpenAccount={() => setAccountModalOpen(true)}
                    />
                  </div>
                </div>
              {(selectedTag || selectedSource) || hasActiveSearch ? (
                <div
                  className={`home-filter-mode${
                    selectedTag
                      ? ' home-filter-mode--tag'
                      : selectedSource
                        ? ' home-filter-mode--source'
                        : ' home-filter-mode--search'
                  }`}
                  role="status"
                >
                  {selectedTag ? (
                    <>
                      <div className="home-filter-mode-tag-main">
                        <span
                          className={`home-filter-mode-tag-pill tag-tone-${selectedTag.color_index % TAG_COLOR_COUNT}`}
                        >
                          {displayTagName(selectedTag.name)}
                        </span>
                        <span className="home-filter-mode-tag-desc">
                          이 태그가 붙은 메모만
                        </span>
                      </div>
                      <button
                        type="button"
                        className="home-filter-mode-clear"
                        onClick={() => clearTagFilter()}
                      >
                        필터 해제
                      </button>
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
                  ) : (
                    <>
                      <span className="home-filter-mode-label">
                        「{normalizeTagInput(tagSearch)}」 검색 중
                      </span>
                      <button
                        type="button"
                        className="home-filter-mode-clear"
                        onClick={() => clearMainSearch()}
                      >
                        검색 지우기
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              <section
                className="tag-grid-section"
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
                          <span
                            className={`tag-grid-pill tag-grid-pill--context tag-tone-${t.color_index % TAG_COLOR_COUNT}`}
                          >
                            {displayTagName(t.name)}
                          </span>
                        ) : (
                          <button
                            ref={
                              selectedTagId === t.id ? selectedTagBtnRef : undefined
                            }
                            type="button"
                            className={`tag-grid-pill tag-tone-${t.color_index % TAG_COLOR_COUNT}${
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
              {!loading &&
              allSources.length > 0 &&
              !selectedTagId &&
              !hasActiveSearch ? (
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
                user={user}
                onOpenTagManage={() => setTagManageOpen(true)}
                onToggleAddNote={() => toggleAddNote()}
                onOpenAccount={() => setAccountModalOpen(true)}
              />
            </nav>
          </>
        ) : null}

        <main
          className={`home-main home-main--tags${showBootstrap ? ' home-main--bootstrap' : ''}`}
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

          {!showBootstrap &&
          hasActiveSearch &&
          !selectedTagId &&
          !selectedSourceId &&
          searchNotesLoading &&
          notesMatchingSearch.length === 0 ? (
            <section
              className="note-board-section note-memo-search-section"
              aria-busy={true}
              aria-label="메모·출처 검색 결과"
            >
              <p className="notes-hint">검색하는 중…</p>
            </section>
          ) : null}

          {!showBootstrap &&
          hasActiveSearch &&
          !selectedTagId &&
          !selectedSourceId &&
          !searchNotesLoading &&
          notesMatchingSearch.length === 0 ? (
            <section
              className="note-board-section note-memo-search-section"
              aria-label="메모·출처 검색 결과"
            >
              <p className="notes-hint note-board-empty">검색 결과가 없습니다.</p>
            </section>
          ) : null}

          {!showBootstrap &&
          hasActiveSearch &&
          !selectedTagId &&
          !selectedSourceId &&
          notesMatchingSearch.length > 0 ? (
            <section
              className="note-board-section note-memo-search-section"
              aria-busy={searchNotesLoading}
              aria-label="메모·출처 검색 결과"
            >
              <h2 className="note-memo-search-title">메모·출처 검색</h2>
              <ul className="note-board-list">
                {notesMatchingSearch.map((note) => (
                  <li key={note.id}>
                    <NoteBoardCard
                      note={note}
                      onView={openViewNote}
                      onSourceFilter={filterBySourceFromCard}
                    />
                  </li>
                ))}
              </ul>
              {searchHasMore ? (
                <p className="notes-hint note-board-more-hint" role="status">
                  검색 결과가 50개를 넘습니다. 검색어를 더 구체적으로 입력해
                  보세요.
                </p>
              ) : null}
            </section>
          ) : null}

          {!showBootstrap && selectedTagId ? (
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
                active={tagPullLoading}
                hasCachedNotes={notesForSelectedTag.length > 0}
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
                        onView={openViewNote}
                        onSourceFilter={filterBySourceFromCard}
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

          {!showBootstrap && selectedSourceId ? (
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
                active={sourcePullLoading}
                hasCachedNotes={notesForSelectedSource.length > 0}
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
                        onView={openViewNote}
                        onSourceFilter={filterBySourceFromCard}
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
      </>

      {user ? (
        <AddNoteModal
          open={addNoteOpen}
          onClose={() => closeAddNote()}
          initialTags={EMPTY_MODAL_SEED_TAGS}
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

      <TagManageModal
        open={tagManageOpen}
        onClose={() => setTagManageOpen(false)}
        tags={allTags}
        onTagUpdated={applyTagUpdated}
        onTagDeleted={applyTagDeleted}
        resolveLinkedNoteIds={resolveLinkedNoteIds}
        onTagError={(message) => setSaveError(message)}
        onSyncFromServer={syncAllFromServer}
        onSourcesChanged={refreshSourcesInUse}
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
          loading={viewNoteLoading}
          onClose={() => {
            setViewingNote(null)
            setViewNoteLoading(false)
          }}
          onEdit={openEditNote}
          onSourceFilter={filterBySourceFromCard}
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
