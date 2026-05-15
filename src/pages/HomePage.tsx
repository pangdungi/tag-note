import { useCallback, useEffect, useMemo, useState } from 'react'
import { TagComposer, type SelectedTag } from '../components/TagComposer'
import { TagManageModal } from '../components/TagManageModal'
import { AccountModal } from '../components/AccountModal'
import { useAuth } from '../contexts/useAuth'
import {
  createNoteWithTags,
  fetchNotesWithTags,
  fetchTags,
  filterTagsByMainSearch,
  type NoteWithTags,
  type TagRow,
} from '../lib/notesApi'
import { displayTagName, normalizeTagInput, pickColorIndex } from '../lib/tagUtils'
import tagIconUrl from '../assets/tag-icon.png'
import userCircleIconUrl from '../assets/user-circle-icon.png'

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

function NoteBoardCard({ note }: { note: NoteWithTags }) {
  const tagLinks = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string; color_index: number }[]

  const sorted = [...tagLinks].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )

  const src = (note.source ?? '').trim()
  const body = note.body?.trim() ?? ''

  return (
    <article className="note-board-card">
      <div className="note-board-card-tags">
        {sorted.map((tg) => (
          <span
            key={tg.id}
            className={`note-board-tag-pill tag-tone-${tg.color_index % 8}`}
          >
            {displayTagName(tg.name)}
          </span>
        ))}
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

export function HomePage() {
  const { user, signOut } = useAuth()
  const [tagSearch, setTagSearch] = useState('')
  const [bootstrapTags, setBootstrapTags] = useState<SelectedTag[]>([])
  const [bootstrapBody, setBootstrapBody] = useState('')
  const [bootstrapSource, setBootstrapSource] = useState('')
  const [allTags, setAllTags] = useState<TagRow[]>([])
  const [notes, setNotes] = useState<NoteWithTags[]>([])
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTags, setComposeTags] = useState<SelectedTag[]>([])
  const [composeBody, setComposeBody] = useState('')
  const [composeSource, setComposeSource] = useState('')
  const [composeError, setComposeError] = useState<string | null>(null)

  const [tagManageOpen, setTagManageOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [tags, noteRows] = await Promise.all([
        fetchTags(),
        fetchNotesWithTags(),
      ])
      setAllTags(tags)
      setNotes(noteRows)
      setSaveError(null)
      setLoadError(null)
    } catch (e) {
      console.error(e)
      setLoadError(
        e instanceof Error ? e.message : '알 수 없는 오류로 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 초기/세션 전환 시 Supabase 페치
    void loadData()
  }, [loadData])

  const visibleTags = useMemo(
    () => filterTagsByMainSearch(allTags, tagSearch),
    [allTags, tagSearch],
  )

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
  }

  const selectedTagLabel = useMemo(() => {
    if (!selectedTagId) return null
    const t = allTags.find((x) => x.id === selectedTagId)
    return t ? displayTagName(t.name) : null
  }, [allTags, selectedTagId])

  const searchNormalized = useMemo(
    () => normalizeTagInput(tagSearch).toLowerCase(),
    [tagSearch],
  )

  const hasExactTagMatch = useMemo(
    () =>
      searchNormalized.length > 0 &&
      allTags.some(
        (t) => normalizeTagInput(t.name).toLowerCase() === searchNormalized,
      ),
    [allTags, searchNormalized],
  )

  async function handleBootstrapSave() {
    if (!user?.id) return
    setSaveError(null)
    try {
      await createNoteWithTags(
        bootstrapBody,
        bootstrapTags.map((t) => t.name),
        user.id,
        [...allTags],
        bootstrapSource,
      )
      setBootstrapBody('')
      setBootstrapSource('')
      setBootstrapTags([])
      await loadData()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    }
  }

  const showBootstrap = allTags.length === 0 && !loading

  const showAddTagFromSearch =
    !showBootstrap &&
    !loading &&
    !loadError &&
    searchNormalized.length > 0 &&
    !hasExactTagMatch

  const canUseCompose = !showBootstrap && !loading && !loadError

  function openCompose() {
    if (!canUseCompose) return
    setComposeError(null)
    const seed: SelectedTag[] = []
    if (showAddTagFromSearch) {
      const label = normalizeTagInput(tagSearch)
      if (label) {
        const used = allTags.map((t) => ({
          name: t.name,
          color_index: t.color_index,
        }))
        seed.push({
          name: label,
          color_index: pickColorIndex(label, used),
        })
      }
    }
    setComposeTags(seed)
    setComposeOpen(true)
  }

  function closeCompose() {
    setComposeOpen(false)
    setComposeTags([])
    setComposeBody('')
    setComposeSource('')
    setComposeError(null)
  }

  function toggleCompose() {
    if (composeOpen) closeCompose()
    else openCompose()
  }

  async function handleComposeSave() {
    if (!user?.id || !composeOpen) return
    setComposeError(null)
    try {
      await createNoteWithTags(
        composeBody,
        composeTags.map((t) => t.name),
        user.id,
        [...allTags],
        composeSource,
      )
      closeCompose()
      setTagSearch('')
      await loadData()
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    }
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
            onClick={() => void loadData()}
          >
            다시 불러오기
          </button>
        </div>
      ) : null}

      <>
        {!showBootstrap ? (
            <header className="home-top-tag-search" role="search">
              <div className="home-top-tag-search-inner">
                <div className="home-tag-search-row">
                  <div className="home-search-wrap">
                    <span className="sr-only">태그 검색</span>
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
                      placeholder="태그 검색 (이름, 비슷한 단어)"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label="태그 관리 열기"
                    title="태그 관리"
                    disabled={!canUseCompose}
                    onClick={() => setTagManageOpen(true)}
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
                    className={`btn btn--icon${composeOpen ? ' btn--active' : ''}`}
                    disabled={!canUseCompose}
                    aria-expanded={composeOpen}
                    aria-label={composeOpen ? '메모 입력 닫기' : '메모 입력 열기'}
                    title={composeOpen ? '입력 영역 닫기' : '태그·메모 입력'}
                    onClick={() => toggleCompose()}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label="내 계정"
                    title="내 계정"
                    disabled={!user}
                    onClick={() => setAccountModalOpen(true)}
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
                </div>
              </div>
            </header>
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
                    onChange={setBootstrapTags}
                  />
                  <div className="composer-field">
                    <label className="composer-label" htmlFor="bootstrap-note">
                      메모
                    </label>
                    <textarea
                      id="bootstrap-note"
                      className="composer-note"
                      value={bootstrapBody}
                      onChange={(e) => setBootstrapBody(e.target.value)}
                      placeholder="내용을 입력하세요"
                      rows={5}
                      disabled={!!loadError}
                    />
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
                className="btn btn--emphasis btn--block composer-save"
                disabled={loading || !!loadError}
                onClick={() => void handleBootstrapSave()}
              >
                저장
              </button>
            </section>
          ) : null}

          {!showBootstrap ? (
            <section className="tag-grid-section" aria-label="내 태그">
              {loading ? (
                <p className="notes-hint">불러오는 중…</p>
              ) : visibleTags.length === 0 ? (
                <p className="notes-hint">
                  {normalizeTagInput(tagSearch)
                    ? '검색과 비슷한 태그가 없습니다.'
                    : '태그가 없습니다.'}
                </p>
              ) : (
                <ul
                  className={
                    selectedTagId
                      ? 'tag-grid tag-grid--single-row'
                      : 'tag-grid'
                  }
                >
                  {visibleTags.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`tag-grid-pill tag-tone-${t.color_index % 8}${
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
          ) : null}

          {!showBootstrap && selectedTagId ? (
            <section
              className="note-board-section"
              aria-label={
                selectedTagLabel
                  ? `${selectedTagLabel} 관련 메모`
                  : '선택한 태그의 메모'
              }
            >
              {notesForSelectedTag.length === 0 ? (
                <p className="notes-hint note-board-empty">
                  이 태그가 달린 메모가 아직 없습니다.
                </p>
              ) : (
                <ul className="note-board-grid">
                  {notesForSelectedTag.map((note) => (
                    <li key={note.id}>
                      <NoteBoardCard note={note} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {!showBootstrap && composeOpen ? (
            <section
              className="home-inline-compose"
              aria-label="새 메모 작성"
            >
              <div className="home-inline-compose-inner">
                <div className="composer-stack">
                  <TagComposer
                    allTags={allTags}
                    selected={composeTags}
                    onChange={setComposeTags}
                  />
                  <div className="composer-field">
                    <label className="composer-label" htmlFor="home-compose-note">
                      메모
                    </label>
                    <textarea
                      id="home-compose-note"
                      className="composer-note home-inline-compose-note"
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="내용을 입력하세요"
                      rows={5}
                    />
                  </div>
                  <div className="composer-field">
                    <label className="composer-label" htmlFor="home-compose-source">
                      출처
                    </label>
                    <input
                      id="home-compose-source"
                      type="text"
                      className="composer-source"
                      value={composeSource}
                      onChange={(e) => setComposeSource(e.target.value)}
                      placeholder="책, 링크, 기사 등 (선택)"
                      autoComplete="off"
                    />
                  </div>
                </div>
                {composeError ? (
                  <p className="composer-error">{composeError}</p>
                ) : null}
                <div className="home-inline-compose-actions">
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => closeCompose()}
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    className="btn btn--emphasis"
                    disabled={composeTags.length === 0 || loading}
                    onClick={() => void handleComposeSave()}
                  >
                    저장
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </>

      <TagManageModal
        open={tagManageOpen}
        onClose={() => setTagManageOpen(false)}
        tags={allTags}
        onReload={loadData}
        onDeletedTagId={(id) => {
          setSelectedTagId((s) => (s === id ? null : s))
        }}
      />

      {user ? (
        <AccountModal
          open={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          user={user}
          onSignOut={signOut}
        />
      ) : null}
    </div>
  )
}
