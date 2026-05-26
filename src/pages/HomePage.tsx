import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TagComposer, type SelectedTag } from '../components/TagComposer'
import { TagManageModal } from '../components/TagManageModal'
import { AccountModal } from '../components/AccountModal'
import { EditNoteModal } from '../components/EditNoteModal'
import { AddNoteModal } from '../components/AddNoteModal'
import { TagNotesPullStatus } from '../components/TagNotesPullStatus'
import { useAuth } from '../contexts/useAuth'
import {
  createNoteWithTags,
  ensureStarterTagsIfEmpty,
  fetchNotesWithTags,
  fetchNotesForMainSearch,
  fetchTags,
  filterNotesByMainSearch,
  filterTagsByMainSearch,
  mapNotesWithRenamedTag,
  mergeTagsFromNoteIntoAllTags,
  mergeNotesById,
  syncNotesStateAfterTagSelectionPull,
  type NoteWithTags,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput, TAG_COLOR_COUNT } from '../lib/tagUtils'
import { useLoadingUiMountLog } from '../lib/loadingUiMountLog'
import { isSupabaseConfigured } from '../lib/supabase'
import tagIconUrl from '../assets/tag-icon.png'
import userCircleIconUrl from '../assets/user-circle-icon.png'
import editPencilUrl from '../assets/edit-pencil.png'

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
  mobileExpanded,
  onTouchToggleExpand,
  onEdit,
}: {
  note: NoteWithTags
  mobileExpanded: boolean
  onTouchToggleExpand: () => void
  onEdit: (n: NoteWithTags) => void
}) {
  const tagLinks = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string; color_index: number }[]

  const sorted = [...tagLinks].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )

  const src = (note.source ?? '').trim()
  const body = note.body?.trim() ?? ''

  return (
    <article
      className={`note-board-card${mobileExpanded ? ' note-board-card--mobile-expand' : ''}`}
      onClick={() => {
        if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
          onTouchToggleExpand()
        }
      }}
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
        <button
          type="button"
          className="note-board-card-edit"
          aria-label="메모 수정"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(note)
          }}
        >
          <img
            src={editPencilUrl}
            alt=""
            width={12}
            height={12}
            decoding="async"
            className="note-board-card-edit-img"
          />
        </button>
      </div>
      <p
        className={`note-board-card-preview${
          !body ? ' note-board-card-preview--empty' : ''
        }`}
      >
        {body || '내용 없음'}
      </p>
      <div className="note-board-card-meta">
        {src ? (
          <span className="note-board-card-source">{src}</span>
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
  const [bootstrapSource, setBootstrapSource] = useState('')
  const [allTags, setAllTags] = useState<TagRow[]>([])
  const [notes, setNotes] = useState<NoteWithTags[]>([])
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** 첫 작성 카드: 저장 검증 안내 */
  const [bootstrapFieldHint, setBootstrapFieldHint] = useState<
    'tags' | 'body' | null
  >(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [addNoteOpen, setAddNoteOpen] = useState(false)

  const [tagManageOpen, setTagManageOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<NoteWithTags | null>(null)
  const [noteMobileExpandedId, setNoteMobileExpandedId] = useState<string | null>(null)

  /** 이 계정에서 첫 데이터 패치가 끝났는지 — 이후엔 태그 칸 전체「불러오는 중」을 안 띄움 */
  const homeDataInitialLoadDoneRef = useRef(false)

  /** 태그 클릭 시 `syncNotes…`에 넘길 최신 `notes` (비동기 완료 시점 참고용) */
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  const fetchHomeSnapshot = useCallback(async (uid: string) => {
    const [tags, noteRows] = await Promise.all([
      fetchTags(),
      fetchNotesWithTags(),
    ])
    const tagsAfterStarter =
      tags.length === 0 ? await ensureStarterTagsIfEmpty(uid) : tags
    return { tags: tagsAfterStarter, notes: noteRows }
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
        const { tags, notes: noteRows } = await fetchHomeSnapshot(uid)
        setAllTags(tags)
        setNotes(noteRows)
        setSaveError(null)
        setLoadError(null)
        homeDataInitialLoadDoneRef.current = true
      } catch (e) {
        setLoadError(
          e instanceof Error
            ? e.message
            : '알 수 없는 오류로 불러오지 못했습니다.',
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

  /** 메모·출처 검색 — 서버 조회 결과 (검색어 키와 함께 보관) */
  const [searchNotesResult, setSearchNotesResult] = useState<{
    q: string
    notes: NoteWithTags[]
  } | null>(null)
  const [searchNotesLoading, setSearchNotesLoading] = useState(false)

  const applyNoteCreated = useCallback((note: NoteWithTags) => {
    setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)])
    setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
    setTagSearch('')
    setSaveError(null)
  }, [])

  const applyNoteUpdated = useCallback((note: NoteWithTags) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
    setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
    setSaveError(null)
  }, [])

  const applyNoteDeleted = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    setEditingNote((cur) => (cur?.id === noteId ? null : cur))
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
        setNotes(next)
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

  const visibleTags = useMemo(
    () => filterTagsByMainSearch(allTags, tagSearch),
    [allTags, tagSearch],
  )

  const searchNormalized = useMemo(
    () => normalizeTagInput(tagSearch).toLowerCase(),
    [tagSearch],
  )

  const hasActiveSearch = searchNormalized.length > 0

  const notesMatchingSearch = useMemo(() => {
    if (!hasActiveSearch || selectedTagId) return []
    if (searchNotesResult?.q === searchNormalized) {
      return searchNotesResult.notes
    }
    return filterNotesByMainSearch(notes, tagSearch)
  }, [
    hasActiveSearch,
    selectedTagId,
    searchNormalized,
    searchNotesResult,
    notes,
    tagSearch,
  ])

  const notesForSelectedTag = useMemo(() => {
    if (!selectedTagId) return []
    return notes.filter((n) =>
      n.note_tags.some(
        (nt) => nt.tag_id === selectedTagId || nt.tags?.id === selectedTagId,
      ),
    )
  }, [notes, selectedTagId])

  function toggleTagSelect(tagId: string) {
    setSelectedTagId((cur) => (cur === tagId ? null : tagId))
    setNoteMobileExpandedId(null)
  }

  function toggleNoteMobileExpand(noteId: string) {
    setNoteMobileExpandedId((cur) => (cur === noteId ? null : noteId))
  }

  function openEditNote(note: NoteWithTags) {
    setEditingNote(note)
    setNoteMobileExpandedId(null)
  }

  const selectedTagLabel = useMemo(() => {
    if (!selectedTagId) return null
    const t = allTags.find((x) => x.id === selectedTagId)
    return t ? displayTagName(t.name) : null
  }, [allTags, selectedTagId])

  useEffect(() => {
    if (!hasActiveSearch || selectedTagId || !user?.id) {
      setSearchNotesResult(null)
      setSearchNotesLoading(false)
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
          const rows = await fetchNotesForMainSearch(qRaw, tagIds)
          if (cancelled) return
          setSearchNotesResult({ q: qKey, notes: rows })
          setNotes((prev) => mergeNotesById(prev, rows))
          setLoadError(null)
        } catch (e) {
          if (!cancelled) {
            setLoadError(
              e instanceof Error
                ? e.message
                : '알 수 없는 오류로 검색하지 못했습니다.',
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
    searchNormalized,
    tagSearch,
    visibleTags,
    user?.id,
  ])

  useEffect(() => {
    if (!hasActiveSearch || !selectedTagId) return
    if (!visibleTags.some((t) => t.id === selectedTagId)) {
      setSelectedTagId(null)
    }
  }, [hasActiveSearch, selectedTagId, visibleTags])

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
    const saveSource = bootstrapSource
    setBootstrapBody('')
    setBootstrapSource('')
    setBootstrapTags([])
    try {
      const note = await createNoteWithTags(
        saveBody,
        saveTags,
        user.id,
        [...allTags],
        saveSource,
      )
      applyNoteCreated(note)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했습니다.')
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
          <p className="setup-banner-title">Supabase 테이블이 아직 없는 것 같아요</p>
          <p className="setup-banner-text">
            대시보드에서 <strong>SQL Editor</strong>를 열고, 프로젝트 안의{' '}
            <code className="inline-code">supabase/migrations/001_notes_tags.sql</code>{' '}
            파일 <strong>전체</strong>를 복사해 붙여넣은 뒤 <strong>Run</strong>으로
            실행하세요. 끝나면 아래 <strong>다시 불러오기</strong>를 누르면 됩니다.
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
              selectedTagId || searchNormalized.length > 0
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
                        setTagSearch(e.target.value)
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
              <section className="tag-grid-section" aria-label="내 태그">
                {loading ? (
                  <HomeTagGridLoadingHint />
                ) : visibleTags.length === 0 ? (
                  <p className="notes-hint">
                    {hasActiveSearch
                      ? notesMatchingSearch.length > 0
                        ? '태그 검색 결과는 없습니다. 아래 메모·출처 결과를 확인해 보세요.'
                        : '검색 결과가 없습니다.'
                      : '태그가 없습니다.'}
                  </p>
                ) : (
                  <ul
                    className={
                      selectedTagId || addNoteOpen
                        ? 'tag-grid tag-grid--single-row'
                        : 'tag-grid'
                    }
                  >
                    {visibleTags.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`tag-grid-pill tag-tone-${t.color_index % TAG_COLOR_COUNT}${
                            selectedTagId === t.id ? ' tag-grid-pill--selected' : ''
                          }`}
                          aria-pressed={selectedTagId === t.id}
                          onClick={() => toggleTagSelect(t.id)}
                        >
                          {displayTagName(t.name)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
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
                    <textarea
                      id="bootstrap-note"
                      className="composer-note"
                      value={bootstrapBody}
                      onChange={(e) => {
                        setBootstrapBody(e.target.value)
                        setBootstrapFieldHint((h) =>
                          h === 'body' ? null : h,
                        )
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
                  <div className="composer-field">
                    <label className="composer-label" htmlFor="bootstrap-source">
                      출처
                    </label>
                    <input
                      id="bootstrap-source"
                      type="text"
                      className="composer-source"
                      value={bootstrapSource}
                      onChange={(e) => setBootstrapSource(e.target.value)}
                      placeholder="책, 링크, 기사 등 (선택)"
                      autoComplete="off"
                      disabled={!!loadError}
                    />
                  </div>
                </div>
              </div>
              {saveError ? <p className="composer-error">{saveError}</p> : null}
              <button
                type="button"
                className={`btn btn--emphasis btn--block composer-save${
                  bootstrapSaveReady ? ' btn--composer-ready' : ''
                }`}
                disabled={loading || !!loadError}
                onClick={() => void handleBootstrapSave()}
              >
                저장
              </button>
            </section>
          ) : null}

          {!showBootstrap &&
          hasActiveSearch &&
          !selectedTagId &&
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
                      mobileExpanded={noteMobileExpandedId === note.id}
                      onTouchToggleExpand={() => toggleNoteMobileExpand(note.id)}
                      onEdit={openEditNote}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!showBootstrap && selectedTagId ? (
            <section
              className="note-board-section"
              aria-busy={tagPullLoading}
              aria-label={
                selectedTagLabel
                  ? `${selectedTagLabel} 관련 메모`
                  : '선택한 태그의 메모'
              }
            >
              {selectedTagLabel ? (
                <h2 className="note-memo-search-title">{selectedTagLabel}</h2>
              ) : null}
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
                        mobileExpanded={noteMobileExpandedId === note.id}
                        onTouchToggleExpand={() => toggleNoteMobileExpand(note.id)}
                        onEdit={openEditNote}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </main>
      </>

      {user ? (
        <AddNoteModal
          open={addNoteOpen}
          onClose={() => closeAddNote()}
          initialTags={[]}
          allTags={allTags}
          userId={user.id}
          onSaved={applyNoteCreated}
          onSaveError={(message) => setSaveError(message)}
        />
      ) : null}

      <TagManageModal
        open={tagManageOpen}
        onClose={() => setTagManageOpen(false)}
        tags={allTags}
        onTagUpdated={applyTagUpdated}
        onTagDeleted={applyTagDeleted}
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
        <EditNoteModal
          open={editingNote !== null}
          onClose={() => setEditingNote(null)}
          note={editingNote}
          allTags={allTags}
          userId={user.id}
          onNoteUpdated={applyNoteUpdated}
          onUpdateError={(message) => setSaveError(message)}
          onNoteDeleted={applyNoteDeleted}
        />
      ) : null}
    </div>
  )
}
