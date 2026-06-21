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
import { ParentTagBookReaderModal } from '../components/ParentTagBookReaderModal'
import { AppSplashScreen } from '../components/AppSplashScreen'
import { AddNoteModal } from '../components/AddNoteModal'
import { TagNotesPullStatus } from '../components/TagNotesPullStatus'
import { useAuth } from '../contexts/useAuth'
import {
  createNoteWithTags,
  fetchNoteWithTagsById,
  fetchNotesPage,
  fetchNotesForMainSearch,
  fetchSourcesInUse,
  fetchSourceDistinctTagCounts,
  fetchTagMemoCounts,
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
  NOTES_LIST_PAGE_SIZE,
  pullAllTagNotesForTagIds,
  supabaseErrorMessage,
  syncNotesStateAfterSourceSelectionPull,
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
  getTagsForTagViewRail,
  isBooksRailParentTag,
  isParentTagRailActive,
  isTagChildOfParent,
  normalizeTagInput,
  formatSpineLabel,
  formatSpineText,
  tagHasChildren,
  TAG_RAIL_INDEX_KO,
  TAG_RAIL_INDEX_EN,
  TAG_RAIL_INDEX_ETC,
  tagRailIndexHasTags,
  tagRailIndexLabel,
  firstTagIdForRailIndexKey,
  noteHasNoTagViewTags,
  TAG_VIEW_NONE_ID,
  resolveAddNoteParentTagId,
  resolveAddNoteComposeState,
  resolveLockedParentTagIdForNoteModal,
  resolveBooksRailExpandedParentForTag,
  resolveSelectedTagFilterIds,
  filterNotesForAllTagIds,
  filterNotesForAnyTagIds,
  filterNotesForParentOnlyUnderParent,
  filterNotesForParentTagTree,
  type TagRailIndexKey,
} from '../lib/tagUtils'
import { groupNotesByDate } from '../lib/noteDateUtils'
import { displaySourceTitle, sourceTitleKey } from '../lib/sourceUtils'
import { HomeDateViewRail } from '../components/HomeDateViewRail'
import { useParentRailHorizontalTouch } from '../hooks/useParentRailHorizontalTouch'
import { MemoBodyContent } from '../components/MemoBodyContent'
import { MemoNoteEditor } from '../components/MemoNoteEditor'
import {
  readHomeSnapshotCache,
  writeHomeSnapshotCache,
} from '../lib/homeSnapshotCache'
import { useLoadingUiMountLog } from '../lib/loadingUiMountLog'
import { isSupabaseConfigured } from '../lib/supabase'
import { AccountModal } from '../components/AccountModal'
import tagIconUrl from '../assets/tag-icon.png'
import addBookIconUrl from '../assets/addbook.png'
import bookOpenIconUrl from '../assets/book-open-icon.png'
import userCircleIconUrl from '../assets/user-circle-icon.png'

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

function resolveParentSheetLayout(
  note: NoteWithTags,
  hideParentTagId?: string,
): 'parent-sheet' | 'parent-sheet-memo-only' {
  const tagIds = note.note_tags
    .map((nt) => nt.tags?.id ?? nt.tag_id)
    .filter((id): id is string => Boolean(id))
  const visibleTagIds = hideParentTagId
    ? tagIds.filter((id) => id !== hideParentTagId)
    : tagIds
  return visibleTagIds.length === 0 ? 'parent-sheet-memo-only' : 'parent-sheet'
}

function NoteBoardCard({
  note,
  onView,
  onSourceFilter,
  onTagFilter,
  excludeTagId,
  hideTagIds,
  sourceLink = true,
  layout = 'default',
}: {
  note: NoteWithTags
  onView: (note: NoteWithTags, contextTagId?: string | null) => void
  onSourceFilter?: (sourceId: string) => void
  onTagFilter?: (tagId: string) => void
  /** 클릭한 태그 화면 — 해당 태그 pill 숨김, 다른 태그만 표시 */
  excludeTagId?: string | null
  /** 추가로 숨길 태그 pill (책 뷰 상위 spine 등) */
  hideTagIds?: string[]
  /** false면 출처를 링크 없이 표시 (태그 뷰) */
  sourceLink?: boolean
  /** 상위태그(책) 뷰 — 태그|메모 2열 시트 */
  layout?: 'default' | 'parent-sheet' | 'parent-sheet-memo-only'
}) {
  const tagLinks = note.note_tags
    .map((nt) => nt.tags)
    .filter(Boolean) as { id: string; name: string; color_index: number }[]

  const sorted = [...tagLinks].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
  const hidden = new Set(
    hideTagIds?.filter(Boolean) ?? [],
  )
  if (excludeTagId) hidden.add(excludeTagId)
  const visibleTags = sorted.filter((tg) => !hidden.has(tg.id))

  const src = noteSourceLabel(note)
  const srcId = note.source_id ?? note.sources?.id ?? null
  const body = note.body?.trim() ?? ''

  const sheetArticleProps = body
    ? { role: 'button' as const, tabIndex: 0 }
    : {}

  const sheetMetaRow = (
    <tr className="note-board-sheet-meta-row">
      <td className="note-board-sheet-meta-cell" colSpan={2}>
        <div className="note-board-sheet-meta">
          <div className="note-board-sheet-meta-right">
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
                  {displaySourceTitle(src)}
                </button>
              ) : (
                <span className="note-board-card-source">
                  {displaySourceTitle(src)}
                </span>
              )
            ) : (
              <span className="note-board-sheet-meta-placeholder">
                출처 없음
              </span>
            )}
            <time
              className="note-board-card-time note-board-sheet-meta-date"
              dateTime={note.created_at}
            >
              {formatNoteWhen(note.created_at)}
            </time>
          </div>
        </div>
      </td>
    </tr>
  )

  if (layout === 'parent-sheet-memo-only') {
    return (
      <article
        className={`note-board-card note-board-card--parent-sheet note-board-card--parent-sheet-memo-only${
          body ? ' note-board-card--viewable' : ''
        }`}
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
        {...sheetArticleProps}
      >
        <table className="note-board-sheet-table note-board-sheet-table--memo-only">
          <tbody>
            <tr className="note-board-sheet-body-row">
              <td className="note-board-sheet-memo-cell note-board-sheet-memo-cell--solo">
                <div
                  className={`note-board-sheet-memo${
                    !body ? ' note-board-sheet-memo--empty' : ''
                  }`}
                >
                  <MemoBodyContent as="span" body={body} emptyLabel="내용 없음" />
                </div>
              </td>
            </tr>
            <tr className="note-board-sheet-meta-row">
              <td className="note-board-sheet-meta-cell">
                <div className="note-board-sheet-meta">
                  <div className="note-board-sheet-meta-right">
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
                          {displaySourceTitle(src)}
                        </button>
                      ) : (
                        <span className="note-board-card-source">
                          {displaySourceTitle(src)}
                        </span>
                      )
                    ) : (
                      <span className="note-board-sheet-meta-placeholder">
                        출처 없음
                      </span>
                    )}
                    <time
                      className="note-board-card-time note-board-sheet-meta-date"
                      dateTime={note.created_at}
                    >
                      {formatNoteWhen(note.created_at)}
                    </time>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    )
  }

  if (layout === 'parent-sheet') {
    const sheetTags =
      hidden.size > 0
        ? sorted.filter((tg) => !hidden.has(tg.id))
        : sorted

    return (
      <article
        className={`note-board-card note-board-card--parent-sheet${
          body ? ' note-board-card--viewable' : ''
        }`}
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
        <table className="note-board-sheet-table">
          <thead>
            <tr>
              <th className="note-board-sheet-th note-board-sheet-th--tag">
                태그
              </th>
              <th className="note-board-sheet-th note-board-sheet-th--memo">
                메모
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="note-board-sheet-body-row">
              <td className="note-board-sheet-tags-cell" valign="top">
                {sheetTags.length > 0 ? (
                  <ul className="note-board-sheet-tag-list">
                    {sheetTags.map((tg) => (
                      <li key={tg.id} className="note-board-sheet-tag-item">
                        {onTagFilter ? (
                          <button
                            type="button"
                            className="note-board-sheet-tag note-board-sheet-tag--link"
                            onClick={(e) => {
                              e.stopPropagation()
                              onTagFilter(tg.id)
                            }}
                          >
                            {displayTagName(tg.name)}
                          </button>
                        ) : (
                          <span className="note-board-sheet-tag">
                            {displayTagName(tg.name)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="note-board-sheet-tag note-board-sheet-tag--empty">
                    태그 없음
                  </span>
                )}
              </td>
              <td className="note-board-sheet-memo-cell" valign="top">
                <div
                  className={`note-board-sheet-memo${
                    !body ? ' note-board-sheet-memo--empty' : ''
                  }`}
                >
                  <MemoBodyContent as="span" body={body} emptyLabel="내용 없음" />
                </div>
              </td>
            </tr>
            {sheetMetaRow}
          </tbody>
        </table>
      </article>
    )
  }

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
  onView: (note: NoteWithTags, contextTagId?: string | null) => void
  onTagFilter?: (tagId: string) => void
  hideTagIds?: string[]
  /** 상위태그(책) 뷰 2열 시트 카드 */
  sheetLayout?: boolean
  /** 상위 spine 태그는 1열에서 숨김 — 다른 태그가 있으면 1열 표시 */
  sheetHideParentTagId?: string
}

function InlineRailNotesPanel({
  tagLabel,
  tagId,
  notes,
  loading,
  onView,
  onTagFilter,
  hideTagIds,
  sheetLayout = false,
  sheetHideParentTagId,
}: InlineRailNotesPanelProps) {
  const sheetHiddenTagIds = useMemo(() => {
    if (!sheetHideParentTagId) return hideTagIds
    return [...(hideTagIds ?? []), sheetHideParentTagId]
  }, [hideTagIds, sheetHideParentTagId])
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
          {tagId === TAG_VIEW_NONE_ID
            ? '태그가 없는 메모가 아직 없습니다.'
            : '이 태그가 달린 메모가 아직 없습니다.'}
        </p>
      ) : notes.length > 0 ? (
        <ul className="note-board-list parent-tag-child-note-list">
          {notes.map((note) => (
            <li key={note.id}>
              <NoteBoardCard
                note={note}
                excludeTagId={sheetLayout ? null : tagId}
                hideTagIds={sheetHiddenTagIds}
                onView={onView}
                onTagFilter={onTagFilter}
                sourceLink={false}
                layout={
                  sheetLayout
                    ? resolveParentSheetLayout(note, sheetHideParentTagId)
                    : 'default'
                }
              />
            </li>
          ))}
        </ul>
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

type SelectionPullCacheEntry = { hasMore: boolean; notes: NoteWithTags[] }
type SelectionPullResult = SelectionPullCacheEntry

function tagFilterIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(b)
  return a.every((id) => set.has(id))
}

function tagPullCacheKey(filterTagIds: string[]): string {
  if (
    filterTagIds.length === 1 &&
    filterTagIds[0] === TAG_VIEW_NONE_ID
  ) {
    return 'tags:none:v5'
  }
  return `${filterTagIds.join('+')}:v5`
}

function readLocalNotesForTagFilter(
  filterTagIds: string[],
  prev: NoteWithTags[],
): NoteWithTags[] {
  if (
    filterTagIds.length === 1 &&
    filterTagIds[0] === TAG_VIEW_NONE_ID
  ) {
    return filterLocalNotesForTagViewNone(prev)
  }
  if (filterTagIds.length === 1) {
    return filterNotesForAllTagIds(prev, filterTagIds)
  }
  return filterNotesForAnyTagIds(prev, filterTagIds)
}

function isSelectedTagShownInBrowseRail(
  nav: HomeBrowseNavId,
  tagId: string | null,
  tagsForRail: TagRow[],
): boolean {
  if (!tagId) return false
  if (nav === 'tags') {
    return (
      tagId === TAG_VIEW_NONE_ID || tagsForRail.some((t) => t.id === tagId)
    )
  }
  if (nav === 'books' || nav === 'links') return true
  return false
}

function filterNotesForSingleTagId(
  notes: NoteWithTags[],
  tagId: string,
): NoteWithTags[] {
  return notes
    .filter((n) =>
      n.note_tags.some(
        (nt) => (nt.tags?.id ?? nt.tag_id) === tagId,
      ),
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
}

function filterLocalNotesForTagViewNone(
  prev: NoteWithTags[],
): NoteWithTags[] {
  return prev
    .filter((n) => noteHasNoTagViewTags(n))
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
  const [tagMemoCountById, setTagMemoCountById] = useState<
    Record<string, number>
  >({})
  const [sourceTagCountById, setSourceTagCountById] = useState<
    Record<string, number>
  >({})
  const tagMemoCountByIdRef = useRef(tagMemoCountById)
  const sourceTagCountByIdRef = useRef(sourceTagCountById)
  useEffect(() => {
    tagMemoCountByIdRef.current = tagMemoCountById
  }, [tagMemoCountById])
  useEffect(() => {
    sourceTagCountByIdRef.current = sourceTagCountById
  }, [sourceTagCountById])
  const [sourceNotesHasMore, setSourceNotesHasMore] = useState(false)
  const [sourceNotesLoadingMore, setSourceNotesLoadingMore] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  /** 상위태그 모드 — 하위 태그 메모만 닫아도 펼친 상위 스파인 유지 */
  const [booksRailExpandedParentId, setBooksRailExpandedParentId] = useState<
    string | null
  >(null)
  /** 책 뷰 + 메모 — 상위 spine vs 하위 태그 중 마지막 클릭 */
  const [booksMemoComposeTarget, setBooksMemoComposeTarget] = useState<
    'parent' | 'child' | null
  >(null)
  const booksRailExpandedParentIdRef = useRef(booksRailExpandedParentId)
  useEffect(() => {
    booksRailExpandedParentIdRef.current = booksRailExpandedParentId
  }, [booksRailExpandedParentId])
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [homeBrowseNav, setHomeBrowseNav] = useState<HomeBrowseNavId>('tags')
  /** 태그 필터·pull에 쓰는 뷰 맥락 (browse nav와 다를 수 있음) */
  const [tagFilterNav, setTagFilterNav] = useState<HomeBrowseNavId>('tags')
  /** 검색 등에서 태그 선택 시 태그 목록 레일 숨기고 메모 목록만 */
  const [tagFilterFocusBoard, setTagFilterFocusBoard] = useState(false)
  const [tagViewDrillDown, setTagViewDrillDown] = useState(false)
  const [mobileBrowseFabOpen, setMobileBrowseFabOpen] = useState(false)

  const [addParentTagRailOpen, setAddParentTagRailOpen] = useState(false)
  const [railEditingTag, setRailEditingTag] = useState<TagRow | null>(null)
  const [railEditingParentTag, setRailEditingParentTag] =
    useState<TagRow | null>(null)
  const [railEditingSource, setRailEditingSource] = useState<SourceRow | null>(
    null,
  )
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [bookReaderParentId, setBookReaderParentId] = useState<string | null>(
    null,
  )
  const [editingNote, setEditingNote] = useState<NoteWithTags | null>(null)
  const [editingNoteLockedParentTagId, setEditingNoteLockedParentTagId] =
    useState<string | null>(null)
  const [viewingNote, setViewingNote] = useState<NoteWithTags | null>(null)
  const [viewingNoteContextTagId, setViewingNoteContextTagId] = useState<
    string | null
  >(null)
  const [viewNoteLoading, setViewNoteLoading] = useState(false)

  /** 이 계정에서 첫 데이터 패치가 끝났는지 — 이후엔 태그 칸 전체「불러오는 중」을 안 띄움 */
  const homeDataInitialLoadDoneRef = useRef(false)

  /** 태그 클릭 시 `syncNotes…`에 넘길 최신 `notes` (비동기 완료 시점 참고용) */
  const notesRef = useRef(notes)
  const allTagsRef = useRef(allTags)
  const tagParentLinksRef = useRef(tagParentLinks)
  const allSourcesRef = useRef(allSources)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])
  useEffect(() => {
    allTagsRef.current = allTags
  }, [allTags])
  useEffect(() => {
    tagParentLinksRef.current = tagParentLinks
  }, [tagParentLinks])
  useEffect(() => {
    allSourcesRef.current = allSources
  }, [allSources])

  /** 태그 클릭 풀 — 목록+hasMore 캐시 (재클릭 시 네트워크 없음) */
  const tagPullCacheRef = useRef(new Map<string, SelectionPullCacheEntry>())
  const sourcePullCacheRef = useRef(
    new Map<string, { hasMore: boolean }>(),
  )
  const tagPullInFlightRef = useRef(
    new Map<string, Promise<SelectionPullResult>>(),
  )
  const sourcePullInFlightRef = useRef(
    new Map<string, Promise<SelectionPullResult>>(),
  )
  /** 삭제·저장 후 늦게 도착한 태그 pull 응답 무시 */
  const tagPullGenerationRef = useRef(0)
  const selectedTagIdRef = useRef(selectedTagId)
  const homeBrowseNavRef = useRef(homeBrowseNav)
  const tagFilterNavRef = useRef(tagFilterNav)
  useEffect(() => {
    selectedTagIdRef.current = selectedTagId
  }, [selectedTagId])
  useEffect(() => {
    homeBrowseNavRef.current = homeBrowseNav
  }, [homeBrowseNav])
  useEffect(() => {
    tagFilterNavRef.current = tagFilterNav
  }, [tagFilterNav])

  const invalidateTagPullRequests = useCallback(() => {
    tagPullGenerationRef.current += 1
    tagPullInFlightRef.current.clear()
  }, [])

  const reconcileTagPullForNotes = useCallback((notesList: NoteWithTags[]) => {
    const tagId = selectedTagIdRef.current
    if (!tagId) {
      setTagPullEntry(null)
      return
    }
    const nav = tagFilterNavRef.current
    const filterTagIds = resolveSelectedTagFilterIds(
      tagId,
      nav,
      booksRailExpandedParentIdRef.current,
      allTagsRef.current,
      tagParentLinksRef.current,
    )
    const fresh = readLocalNotesForTagFilter(filterTagIds, notesList)
    const key = tagPullCacheKey(filterTagIds)
    tagPullCacheRef.current.set(key, { notes: fresh, hasMore: false })
    setTagPullEntry({ tagId, filterTagIds, nav, notes: fresh })
    setTagPullLoading(false)
  }, [])

  const clearTagPullCache = useCallback((tagId?: string) => {
    invalidateTagPullRequests()
    if (!tagId) {
      tagPullCacheRef.current.clear()
      tagPullInFlightRef.current.clear()
      setTagPullEntry(null)
      return
    }
    for (const key of tagPullCacheRef.current.keys()) {
      if (
        (tagId === TAG_VIEW_NONE_ID && key === 'tags:none:v4') ||
        key.includes(tagId)
      ) {
        tagPullCacheRef.current.delete(key)
        tagPullInFlightRef.current.delete(key)
      }
    }
    setTagPullEntry((cur) =>
      cur && cur.filterTagIds.includes(tagId) ? null : cur,
    )
  }, [invalidateTagPullRequests])

  const fetchHomeSnapshotEssential = useCallback(async () => {
    const [tags, links, notePage] = await Promise.all([
      fetchTags(),
      fetchTagParentLinks(),
      fetchNotesPage(),
    ])
    const sources = await fetchSourcesInUse()
    return {
      tags,
      tagParentLinks: links,
      sources,
      notes: notePage.notes,
    }
  }, [])

  const refreshHomeCountMaps = useCallback(async (uid: string) => {
    try {
      const [tagMemoCounts, sourceTagCounts] = await Promise.all([
        fetchTagMemoCounts(),
        fetchSourceDistinctTagCounts(),
      ])
      setTagMemoCountById(tagMemoCounts)
      setSourceTagCountById(sourceTagCounts)
      writeHomeSnapshotCache(uid, {
        tags: allTagsRef.current,
        tagParentLinks: tagParentLinksRef.current,
        sources: allSourcesRef.current,
        notes: notesRef.current,
        tagMemoCounts,
        sourceTagCounts,
      })
    } catch (e) {
      console.warn('[태그노트] 태그·출처 개수 갱신 실패', e)
    }
  }, [])

  const loadData = useCallback(
    async (opts?: { showGridLoading?: boolean; background?: boolean }) => {
      const uid = user?.id ?? null
      if (!uid) {
        setLoading(false)
        return
      }
      const showGrid =
        opts?.showGridLoading ??
        (!opts?.background && !homeDataInitialLoadDoneRef.current)
      if (showGrid) {
        setLoading(true)
      }
      try {
        const {
          tags,
          tagParentLinks: links,
          sources,
          notes: noteRows,
        } = await fetchHomeSnapshotEssential()
        setAllTags(tags)
        setTagParentLinks(links)
        setAllSources(sources)
        if (opts?.background) {
          setNotes((prev) => mergeNotesById(prev, noteRows))
        } else {
          setNotes(noteRows)
        }
        if (!opts?.background) {
          setSourceNotesHasMore(false)
          clearTagPullCache()
          sourcePullCacheRef.current.clear()
        }
        setSaveError(null)
        setLoadError(null)
        setSearchError(null)
        homeDataInitialLoadDoneRef.current = true
        const mergedNotes = opts?.background
          ? mergeNotesById(notesRef.current, noteRows)
          : noteRows
        writeHomeSnapshotCache(uid, {
          tags,
          tagParentLinks: links,
          sources,
          notes: mergedNotes,
          tagMemoCounts: tagMemoCountByIdRef.current,
          sourceTagCounts: sourceTagCountByIdRef.current,
        })
        void refreshHomeCountMaps(uid)
      } catch (e) {
        console.error('[태그노트] HomePage 초기 불러오기 실패', e)
        if (!opts?.background) {
          setLoadError(
            supabaseErrorMessage(e, '알 수 없는 오류로 불러오지 못했습니다.'),
          )
        }
      } finally {
        if (showGrid) {
          setLoading(false)
        }
      }
    },
    [user?.id, fetchHomeSnapshotEssential, refreshHomeCountMaps, clearTagPullCache],
  )

  /** 태그 동기화 UI — 초기 스냅샷(loadData 성공) 이후 탭 바꿀 때는 표시 안 함 */
  const [tagPullLoading, setTagPullLoading] = useState(false)
  const [tagPullEntry, setTagPullEntry] = useState<{
    tagId: string
    filterTagIds: string[]
    nav: HomeBrowseNavId
    notes: NoteWithTags[]
  } | null>(null)
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
      const sources = await fetchSourcesInUse()
      setAllSources(sources)
      setSelectedSourceId((cur) =>
        cur && sources.some((s) => s.id === cur) ? cur : null,
      )
    } catch (e) {
      console.warn('[태그노트] 출처 목록 갱신 실패', e)
    }
  }, [])

  const refreshHomeTagCounts = useCallback(async () => {
    const uid = user?.id
    if (!uid) return
    await refreshHomeCountMaps(uid)
  }, [user?.id, refreshHomeCountMaps])

  const refreshTagsAndLinks = useCallback(async () => {
    try {
      const [tags, links] = await Promise.all([
        fetchTags(),
        fetchTagParentLinks(),
      ])
      setAllTags(tags)
      setTagParentLinks(links)
    } catch (e) {
      console.warn('[태그노트] 태그·상위 링크 갱신 실패', e)
    }
  }, [])

  const applyNoteCreated = useCallback(
    (note: NoteWithTags, opts?: { replacingId?: string }) => {
      invalidateTagPullRequests()
      setNotes((prev) => {
        const next = [
          note,
          ...prev.filter(
            (n) => n.id !== note.id && n.id !== opts?.replacingId,
          ),
        ]
        reconcileTagPullForNotes(next)
        return next
      })
      setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
      setAllSources((prev) => mergeSourcesFromNoteIntoAllSources(prev, note))
      setTagSearch('')
      setSaveError(null)
      void refreshHomeTagCounts()
      void (async () => {
        await refreshTagsAndLinks()
        reconcileTagPullForNotes(notesRef.current)
      })()
    },
    [
      invalidateTagPullRequests,
      reconcileTagPullForNotes,
      refreshHomeTagCounts,
      refreshTagsAndLinks,
    ],
  )

  const applyNoteRemoved = useCallback((noteId: string) => {
    invalidateTagPullRequests()
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId)
      reconcileTagPullForNotes(next)
      return next
    })
    sourcePullCacheRef.current.clear()
    void refreshHomeTagCounts()
  }, [
    invalidateTagPullRequests,
    reconcileTagPullForNotes,
    refreshHomeTagCounts,
  ])

  const applyNoteUpdated = useCallback(
    (note: NoteWithTags) => {
      invalidateTagPullRequests()
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === note.id ? note : n))
        reconcileTagPullForNotes(next)
        return next
      })
      setAllTags((prev) => mergeTagsFromNoteIntoAllTags(prev, note))
      setAllSources((prev) => mergeSourcesFromNoteIntoAllSources(prev, note))
      setSaveError(null)
      void refreshHomeTagCounts()
    },
    [invalidateTagPullRequests, reconcileTagPullForNotes, refreshHomeTagCounts],
  )

  const applyNoteDeleted = useCallback(
    (noteId: string) => {
      invalidateTagPullRequests()
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== noteId)
        reconcileTagPullForNotes(next)
        return next
      })
      sourcePullCacheRef.current.clear()
      setEditingNote((cur) => (cur?.id === noteId ? null : cur))
      setViewingNote((cur) => (cur?.id === noteId ? null : cur))
      setViewingNoteContextTagId((ctx) =>
        viewingNote?.id === noteId ? null : ctx,
      )
      void refreshHomeTagCounts()
    },
    [
      invalidateTagPullRequests,
      reconcileTagPullForNotes,
      refreshHomeTagCounts,
      viewingNote,
    ],
  )

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
    clearTagPullCache()
    sourcePullCacheRef.current.clear()
    sourcePullInFlightRef.current.clear()
    await loadData({ showGridLoading: false })
  }, [loadData, clearTagPullCache])

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
        clearTagPullCache()
      }
    },
    [clearTagPullCache],
  )

  const applyChildrenSynced = useCallback(
    (payload: { tags: TagRow[]; links: TagParentLink[] }) => {
      setAllTags(
        [...payload.tags].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      )
      setTagParentLinks(payload.links)
      clearTagPullCache()
    },
    [clearTagPullCache],
  )

  const applyTagPromoted = useCallback(
    (result: PromoteTagToParentResult) => {
      applyTagUpdated(result.parent)
      applyTagsAssigned(result.assignedChildren, result.parent.id)
      clearTagPullCache()

      const parentId = result.parent.id
      setHomeBrowseNav('books')
      setMobileBrowseFabOpen(false)
      setSelectedSourceId(null)
      setSourceNotesHasMore(false)
      setBooksRailExpandedParentId(parentId)
      setBooksMemoComposeTarget('parent')
      setSelectedTagId(parentId)
      setViewingNote(null)
      setRailEditingTag(null)
    },
    [applyTagUpdated, applyTagsAssigned, clearTagPullCache],
  )

  const applyTagDeleted = useCallback(
    (payload: { tagId: string; deletedNoteIds: string[] }) => {
      const { tagId } = payload
      invalidateTagPullRequests()
      setSelectedTagId((s) => (s === tagId ? null : s))
      setBooksRailExpandedParentId((s) => (s === tagId ? null : s))
      setBooksMemoComposeTarget(null)
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
        const next = prev.map((n) => ({
          ...n,
          note_tags: n.note_tags.filter(
            (nt) => (nt.tags?.id ?? nt.tag_id) !== tagId,
          ),
        }))
        reconcileTagPullForNotes(next)
        return next
      })
      sourcePullCacheRef.current.clear()
      const unlinkTagFromNote = (note: NoteWithTags): NoteWithTags => ({
        ...note,
        note_tags: note.note_tags.filter(
          (nt) => (nt.tags?.id ?? nt.tag_id) !== tagId,
        ),
      })
      setEditingNote((cur) => {
        if (!cur) return null
        return unlinkTagFromNote(cur)
      })
      setViewingNote((cur) => {
        if (!cur) return null
        return unlinkTagFromNote(cur)
      })
      void refreshHomeTagCounts()
      void refreshTagsAndLinks()
    },
    [
      invalidateTagPullRequests,
      reconcileTagPullForNotes,
      refreshHomeTagCounts,
      refreshTagsAndLinks,
    ],
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
      clearTagPullCache()
    },
    [allSources, clearTagPullCache],
  )

  useEffect(() => {
    const uid = user?.id ?? null
    if (!uid) {
      setLoading(false)
      return
    }

    homeDataInitialLoadDoneRef.current = false
    const cached = readHomeSnapshotCache(uid)
    if (cached) {
      setAllTags(cached.tags)
      setTagParentLinks(cached.tagParentLinks)
      setAllSources(cached.sources)
      setNotes(cached.notes)
      setTagMemoCountById(cached.tagMemoCounts)
      setSourceTagCountById(cached.sourceTagCounts)
      homeDataInitialLoadDoneRef.current = true
      setLoading(false)
      void loadData({ background: true })
      return
    }

    void loadData({ showGridLoading: true })
  }, [user?.id, loadData])

  const tagPullFilterKey = useMemo(() => {
    if (!selectedTagId) return ''
    const filterTagIds = resolveSelectedTagFilterIds(
      selectedTagId,
      tagFilterNav,
      booksRailExpandedParentId,
      allTags,
      tagParentLinks,
    )
    return tagPullCacheKey(filterTagIds)
  }, [
    selectedTagId,
    tagFilterNav,
    booksRailExpandedParentId,
    allTags,
    tagParentLinks,
  ])

  useEffect(() => {
    const pullTagId = selectedTagIdRef.current
    if (!pullTagId || !tagPullFilterKey) {
      setTagPullEntry(null)
      setTagPullLoading(false)
      return
    }
    const uid = user?.id
    if (!uid) {
      return
    }
    const pullNav = tagFilterNavRef.current
    const filterTagIds = resolveSelectedTagFilterIds(
      pullTagId,
      pullNav,
      booksRailExpandedParentIdRef.current,
      allTagsRef.current,
      tagParentLinksRef.current,
    )
    const cacheKey = tagPullCacheKey(filterTagIds)
    const cached = tagPullCacheRef.current.get(cacheKey)
    if (cached) {
      const merged = readLocalNotesForTagFilter(
        filterTagIds,
        mergeNotesById(notesRef.current, cached.notes),
      )
      tagPullCacheRef.current.set(cacheKey, {
        notes: merged,
        hasMore: false,
      })
      setTagPullEntry({
        tagId: pullTagId,
        filterTagIds,
        nav: pullNav,
        notes: merged,
      })
      setTagPullLoading(false)
      return
    }

    const localNotes = readLocalNotesForTagFilter(
      filterTagIds,
      notesRef.current,
    )
    setTagPullEntry({
      tagId: pullTagId,
      filterTagIds,
      nav: pullNav,
      notes: localNotes,
    })
    setTagPullLoading(localNotes.length === 0)

    const pullGen = tagPullGenerationRef.current
    let cancelled = false
    let inFlight = tagPullInFlightRef.current.get(cacheKey)
    if (!inFlight) {
      inFlight = pullAllTagNotesForTagIds(filterTagIds)
        .then((page) => ({ notes: page.notes, hasMore: false }))
        .finally(() => {
          if (tagPullInFlightRef.current.get(cacheKey) === inFlight) {
            tagPullInFlightRef.current.delete(cacheKey)
          }
        })
      tagPullInFlightRef.current.set(cacheKey, inFlight)
    }
    void (async () => {
      try {
        const page = await inFlight!
        if (
          cancelled ||
          pullGen !== tagPullGenerationRef.current
        ) {
          return
        }
        const mergedNotes = readLocalNotesForTagFilter(
          filterTagIds,
          mergeNotesById(notesRef.current, page.notes),
        )
        const entry: SelectionPullCacheEntry = {
          notes: mergedNotes,
          hasMore: false,
        }
        tagPullCacheRef.current.set(cacheKey, entry)
        setTagPullEntry({
          tagId: pullTagId,
          filterTagIds,
          nav: pullNav,
          notes: mergedNotes,
        })
        setNotes((prev) => mergeNotesById(prev, page.notes))
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
  }, [tagPullFilterKey, tagFilterNav, user?.id])

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
    const source = allSourcesRef.current.find((s) => s.id === selectedSourceId)
    const localNotes = filterLocalNotesForSourcePull(
      notesRef.current,
      selectedSourceId,
      source?.title,
    )
    const showPullLoading = localNotes.length === 0
    setSourcePullLoading(showPullLoading)
    if (localNotes.length > 0) {
      setSourceNotesHasMore(localNotes.length >= NOTES_LIST_PAGE_SIZE)
    }
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
        setNotes((prev) => mergeNotesById(prev, next.notes))
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

  const searchParentTagSpines = useMemo(() => {
    if (!hasActiveSearch) return []
    return getParentTags(allTags, tagParentLinks)
      .filter((t) => tagMainSearchScore(t.name, tagSearch) >= 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [hasActiveSearch, allTags, tagParentLinks, tagSearch])

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
    const filterTagIds = resolveSelectedTagFilterIds(
      selectedTagId,
      tagFilterNav,
      booksRailExpandedParentId,
      allTags,
      tagParentLinks,
    )
    if (
      tagPullEntry?.tagId === selectedTagId &&
      tagFilterIdsEqual(tagPullEntry.filterTagIds, filterTagIds)
    ) {
      return tagPullEntry.notes
    }
    return readLocalNotesForTagFilter(filterTagIds, notes)
  }, [
    selectedTagId,
    tagFilterNav,
    booksRailExpandedParentId,
    allTags,
    tagParentLinks,
    tagPullEntry,
    notes,
  ])

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
    setTagFilterFocusBoard(false)
    setTagViewDrillDown(false)
    setSearchOpen(false)
  }

  function clearTagFilter() {
    setSelectedTagId(null)
    setBooksRailExpandedParentId(null)
    setBooksMemoComposeTarget(null)
    setTagPullEntry(null)
    setTagFilterFocusBoard(false)
    setTagViewDrillDown(false)
    setTagFilterNav(homeBrowseNav)
  }

  function goBackToTagList() {
    setSelectedTagId(null)
    setTagViewDrillDown(false)
    setTagPullEntry(null)
    setViewingNote(null)
  }

  function clearDateFilter() {
    setSelectedDateKey(null)
  }

  function clearSourceFilter() {
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
  }

  function selectBrowseNav(id: HomeBrowseNavId) {
    setHomeBrowseNav(id)
    setMobileBrowseFabOpen(false)
    clearSourceFilter()
    clearDateFilter()
    clearMainSearch()
    if (id === 'tags') {
      setTagViewDrillDown(false)
      setBooksRailExpandedParentId(null)
      setTagPullEntry(null)
      setSelectedTagId((cur) => {
        if (!cur || cur === TAG_VIEW_NONE_ID) return cur
        const tag = allTags.find((t) => t.id === cur)
        if (tag && isBooksRailParentTag(tag, allTags, tagParentLinks)) return null
        return cur
      })
    } else {
      clearTagFilter()
    }
  }

  function toggleMobileBrowseFab() {
    setMobileBrowseFabOpen((open) => !open)
  }

  function toggleDateSelect(dateKey: string) {
    setSelectedDateKey((cur) => (cur === dateKey ? null : dateKey))
    setSelectedTagId(null)
    setTagViewDrillDown(false)
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
    setViewingNote(null)
  }

  function syncTagPullEntryForSelection(
    tagId: string | null,
    explicitFilterTagIds?: string[],
    navOverride?: HomeBrowseNavId,
  ) {
    if (!tagId) {
      setTagPullEntry(null)
      return
    }
    const nav = navOverride ?? tagFilterNavRef.current
    const filterTagIds =
      explicitFilterTagIds ??
      resolveSelectedTagFilterIds(
        tagId,
        nav,
        booksRailExpandedParentIdRef.current,
        allTagsRef.current,
        tagParentLinksRef.current,
      )
    setTagPullEntry({
      tagId,
      filterTagIds,
      nav,
      notes: readLocalNotesForTagFilter(filterTagIds, notesRef.current),
    })
  }

  function toggleTagSelect(
    tagId: string,
    options?: { childOfParentId?: string },
  ) {
    const tag = allTags.find((t) => t.id === tagId)
    const childOfParentId = options?.childOfParentId
    const linkedAsChildUnderParent =
      childOfParentId != null &&
      isTagChildOfParent(tagId, childOfParentId, allTags, tagParentLinks)
    const isBooksParent =
      homeBrowseNav === 'books' &&
      Boolean(
        tag &&
          isBooksRailParentTag(tag, allTags, tagParentLinks) &&
          !linkedAsChildUnderParent,
      )

    if (isBooksParent) {
      if (booksRailExpandedParentId === tagId) {
        const children = getChildTags(tagId, allTags, tagParentLinks)
        const childSelected =
          Boolean(selectedTagId) &&
          isTagChildOfParent(selectedTagId!, tagId, allTags, tagParentLinks)
        if (children.length > 0 && childSelected) {
          setSelectedTagId(null)
          setBooksMemoComposeTarget('parent')
          syncTagPullEntryForSelection(null)
          setViewingNote(null)
          return
        }
        setBooksRailExpandedParentId(null)
        setBooksMemoComposeTarget(null)
        setSelectedTagId(null)
        syncTagPullEntryForSelection(null)
      } else {
        const children = getChildTags(tagId, allTags, tagParentLinks)
        setBooksRailExpandedParentId(tagId)
        setBooksMemoComposeTarget('parent')
        if (children.length === 0) {
          setSelectedTagId(tagId)
          syncTagPullEntryForSelection(tagId, [tagId])
        } else {
          setSelectedTagId(null)
          syncTagPullEntryForSelection(null)
        }
      }
      setViewingNote(null)
      return
    }

    let booksFilterParentId = booksRailExpandedParentId
    if (homeBrowseNav === 'books' && tag) {
      const parentId = resolveBooksRailExpandedParentForTag(
        tagId,
        allTags,
        tagParentLinks,
        childOfParentId ?? booksRailExpandedParentId,
      )
      if (parentId) {
        booksFilterParentId = parentId
        setBooksRailExpandedParentId(parentId)
      }
      setBooksMemoComposeTarget('child')
    }

    if (homeBrowseNav === 'tags') {
      if (selectedTagId === tagId) {
        setViewingNote(null)
        return
      }
      setSelectedSourceId(null)
      setSourceNotesHasMore(false)
      setTagViewDrillDown(true)
      setTagFilterFocusBoard(false)
      const filterTagIds = resolveSelectedTagFilterIds(
        tagId,
        homeBrowseNav,
        booksFilterParentId,
        allTags,
        tagParentLinks,
      )
      syncTagPullEntryForSelection(tagId, filterTagIds, homeBrowseNav)
      setTagFilterNav(homeBrowseNav)
      setSelectedTagId(tagId)
      setViewingNote(null)
      return
    }

    const next = selectedTagId === tagId ? null : tagId
    if (next !== null && homeBrowseNav !== 'links') {
      setSelectedSourceId(null)
      setSourceNotesHasMore(false)
    }
    if (next === null) {
      syncTagPullEntryForSelection(null)
    } else {
      const filterTagIds = resolveSelectedTagFilterIds(
        next,
        homeBrowseNav,
        booksFilterParentId,
        allTags,
        tagParentLinks,
      )
      syncTagPullEntryForSelection(next, filterTagIds, homeBrowseNav)
      setTagFilterNav(homeBrowseNav)
    }
    setSelectedTagId(next)
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
        setTagViewDrillDown(false)
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
    setBooksRailExpandedParentId(null)
    setBooksMemoComposeTarget(null)
    setTagSearch('')
    setSearchNotesResult(null)
    setSearchError(null)
    setSearchOpen(false)
    setViewingNote(null)
    setViewingNoteContextTagId(null)
    setViewNoteLoading(false)
  }

  function applyTagFilterFromUI(
    tagId: string,
    options?: { keepSearch?: boolean; focusNoteBoard?: boolean },
  ) {
    if (options?.focusNoteBoard || options?.keepSearch) {
      setTagFilterFocusBoard(true)
    }
    setMobileBrowseFabOpen(false)
    setSelectedSourceId(null)
    setSourceNotesHasMore(false)
    clearDateFilter()

    if (!options?.keepSearch) {
      setTagSearch('')
      setSearchNotesResult(null)
      setSearchError(null)
      setSearchOpen(false)
    }

    setViewingNote(null)
    setViewingNoteContextTagId(null)
    setViewNoteLoading(false)

    const tag = allTags.find((t) => t.id === tagId)
    const isParentSpine = Boolean(
      tag && isBooksRailParentTag(tag, allTags, tagParentLinks),
    )

    let expandedParent: string | null = null
    if (tag?.parent_id) {
      expandedParent = tag.parent_id
    } else {
      const link = tagParentLinks.find((l) => l.tag_id === tagId)
      if (link) {
        expandedParent = link.parent_tag_id
      } else if (tagHasChildren(tagId, allTags, tagParentLinks)) {
        expandedParent = tagId
      }
    }

    const isChildUnderParent =
      expandedParent != null &&
      expandedParent !== tagId &&
      isTagChildOfParent(tagId, expandedParent, allTags, tagParentLinks)

    let navForFilter: HomeBrowseNavId
    let booksParentForFilter: string | null = booksRailExpandedParentId

    if (isParentSpine || isChildUnderParent) {
      navForFilter = 'books'
      booksParentForFilter = isParentSpine
        ? (expandedParent ?? tagId)
        : expandedParent
      setHomeBrowseNav('books')
      setBooksRailExpandedParentId(booksParentForFilter)
      setBooksMemoComposeTarget(isParentSpine ? 'parent' : 'child')
    } else {
      if (homeBrowseNav === 'dates' || homeBrowseNav === 'links') {
        setHomeBrowseNav('tags')
      }
      navForFilter =
        homeBrowseNav === 'dates' || homeBrowseNav === 'links'
          ? 'tags'
          : homeBrowseNav
      setBooksRailExpandedParentId(expandedParent)
      setBooksMemoComposeTarget(null)
      booksParentForFilter = expandedParent
    }

    const filterTagIds = resolveSelectedTagFilterIds(
      tagId,
      navForFilter,
      navForFilter === 'books' ? booksParentForFilter : booksRailExpandedParentId,
      allTags,
      tagParentLinks,
    )

    tagFilterNavRef.current = navForFilter
    setTagFilterNav(navForFilter)
    syncTagPullEntryForSelection(tagId, filterTagIds, navForFilter)
    setSelectedTagId(tagId)
    setTagViewDrillDown(
      navForFilter === 'tags' &&
        !options?.keepSearch &&
        !options?.focusNoteBoard,
    )
  }

  function openTagViewFromNote(tagId: string) {
    const keepSearch = normalizeTagInput(tagSearch).length > 0
    applyTagFilterFromUI(tagId, {
      keepSearch,
      focusNoteBoard: keepSearch,
    })
  }

  function filterBySourceFromCard(sourceId: string) {
    setSelectedSourceId(sourceId)
    setSelectedTagId(null)
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

  function openEditNote(note: NoteWithTags, contextTagId?: string | null) {
    const ctx = contextTagId ?? viewingNoteContextTagId
    setEditingNoteLockedParentTagId(
      resolveLockedParentTagIdForNoteModal(
        ctx,
        allTags,
        tagParentLinks,
      ),
    )
    setViewingNote(null)
    setViewingNoteContextTagId(null)
    setEditingNote(note)
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

  const addNoteCompose = useMemo(
    () =>
      resolveAddNoteComposeState(
        homeBrowseNav,
        selectedTagId,
        booksRailExpandedParentId,
        booksMemoComposeTarget,
        allTags,
        tagParentLinks,
      ),
    [
      homeBrowseNav,
      selectedTagId,
      booksRailExpandedParentId,
      booksMemoComposeTarget,
      allTags,
      tagParentLinks,
    ],
  )

  const tagViewNoneMemoCount = useMemo(
    () => notes.filter((n) => noteHasNoTagViewTags(n)).length,
    [notes, allTags],
  )

  const bookReaderParentTag = useMemo(() => {
    if (!bookReaderParentId) return null
    return allTags.find((t) => t.id === bookReaderParentId) ?? null
  }, [bookReaderParentId, allTags])

  const bookReaderNotes = useMemo(() => {
    if (!bookReaderParentId) return []
    return filterNotesForParentTagTree(
      notes,
      bookReaderParentId,
      allTags,
      tagParentLinks,
    )
  }, [bookReaderParentId, notes, allTags, tagParentLinks])

  const selectedTagIsParent = Boolean(
    selectedTagId &&
      selectedTagId !== TAG_VIEW_NONE_ID &&
      tagHasChildren(selectedTagId, allTags, tagParentLinks),
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

  const tagsForGridScrollKey = useMemo(
    () => tagsForGrid.map((t) => t.id).join('\0'),
    [tagsForGrid],
  )

  const visibleTagIdsKey = useMemo(
    () => visibleTags.map((t) => t.id).join('\0'),
    [visibleTags],
  )

  useEffect(() => {
    if (!selectedTagId) return
    selectedTagBtnRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedTagId, tagsForGridScrollKey])

  const sourcesForGridScrollKey = useMemo(
    () => sourcesForGrid.map((s) => s.id).join('\0'),
    [sourcesForGrid],
  )

  useEffect(() => {
    if (!selectedSourceId) return
    selectedSourceBtnRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedSourceId, sourcesForGridScrollKey])

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
    visibleTagIdsKey,
    user?.id,
  ])

  useEffect(() => {
    if (!selectedTagId || selectedTagId === TAG_VIEW_NONE_ID) return
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
    () => getParentTags(allTags, tagParentLinks),
    [allTags, tagParentLinks],
  )

  const tagsForTagModeRail = useMemo(
    () => getTagsForTagViewRail(allTags, tagParentLinks),
    [allTags, tagParentLinks],
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

  const tagMemoCounts = useMemo(
    () => new Map(Object.entries(tagMemoCountById)),
    [tagMemoCountById],
  )

  const sourceTagCounts = useMemo(
    () => new Map(Object.entries(sourceTagCountById)),
    [sourceTagCountById],
  )

  const notesByDateGroups = useMemo(
    () => groupNotesByDate(notes),
    [notes],
  )

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
        ? tagsForTagModeRail.length > 0 || tagViewNoneMemoCount > 0
        : homeBrowseNav === 'dates'
          ? notes.length > 0
          : sourcesForLinkModeRail.length > 0)

  const effectiveShowBrowseRail =
    showBrowseRail && !tagFilterFocusBoard && !tagViewDrillDown

  const showTagViewDetail = Boolean(
    homeBrowseNav === 'tags' &&
      tagViewDrillDown &&
      selectedTagId &&
      !hasActiveSearch,
  )

  const tagViewDetailLabel =
    selectedTagId === TAG_VIEW_NONE_ID
      ? '태그 없음'
      : selectedTag
        ? displayTagName(selectedTag.name)
        : '태그'

  const showTagFilteredNoteBoard = Boolean(
    selectedTagId &&
      (tagViewDrillDown ||
        tagFilterFocusBoard ||
        hasActiveSearch ||
        !showBrowseRail ||
        !isSelectedTagShownInBrowseRail(
          tagFilterNav,
          selectedTagId,
          tagsForTagModeRail,
        )),
  )

  const showRailViewport =
    !showBootstrap && (effectiveShowBrowseRail || showSearchRail)

  const browseRailAriaLabel =
    homeBrowseNav === 'books'
      ? '상위 태그'
      : homeBrowseNav === 'tags'
        ? '태그'
        : homeBrowseNav === 'dates'
          ? '날짜'
          : '출처'

  const showTagRailIndex =
    homeBrowseNav === 'tags' &&
    effectiveShowBrowseRail &&
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
        top: scroller.scrollTop + slotRect.top - scrollerRect.top - 12,
        behavior: 'smooth',
      })
    },
    [tagsForTagModeRail],
  )

  const showHomeTagGrid = Boolean(
    (selectedTagId || selectedSourceId) &&
      !effectiveShowBrowseRail &&
      !showSearchRail,
  )
  const showHomeSourceGrid = Boolean(selectedSourceId) && !effectiveShowBrowseRail
  const showHomeCompactHeader =
    !showHomeTagGrid && !showHomeSourceGrid && !effectiveShowBrowseRail

  /** 태그·출처 필터 pill 바 (검색은 헤더 입력창) */
  const showHomeFilterBar = Boolean(
    (selectedSource && !effectiveShowBrowseRail) ||
      (selectedTag &&
        showTagFilteredNoteBoard &&
        !showTagViewDetail &&
        (tagFilterFocusBoard ||
          hasActiveSearch ||
          !effectiveShowBrowseRail)),
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
      tagParentLinks,
    ) === null

  const selectedOpenSpineId = useMemo(() => {
    if (homeBrowseNav === 'books') return booksRailExpandedParentId
    if (homeBrowseNav === 'tags') return selectedTagId
    if (homeBrowseNav === 'links') return selectedSourceId
    if (homeBrowseNav === 'dates') return selectedDateKey
    return null
  }, [
    homeBrowseNav,
    booksRailExpandedParentId,
    selectedTagId,
    selectedSourceId,
    selectedDateKey,
  ])

  const railSectionOpen = Boolean(selectedOpenSpineId)

  const railEditContext = useMemo((): RailEditContext | null => {
    if (!effectiveShowBrowseRail || hasActiveSearch) return null

    if (homeBrowseNav === 'books') {
      if (booksRailExpandedParentId) {
        const parent = allTags.find((t) => t.id === booksRailExpandedParentId)
        if (parent) return { kind: 'parent', tag: parent }
      }
      if (selectedTagId) {
        const tag = allTags.find((t) => t.id === selectedTagId)
        if (tag && isBooksRailParentTag(tag, allTags, tagParentLinks)) {
          return { kind: 'parent', tag }
        }
      }
      return null
    }

    if (homeBrowseNav === 'tags') {
      if (
        !selectedTagId ||
        selectedTagId === TAG_VIEW_NONE_ID
      ) {
        return null
      }
      const tag = allTags.find((t) => t.id === selectedTagId)
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
    effectiveShowBrowseRail,
    hasActiveSearch,
    homeBrowseNav,
    selectedTagId,
    booksRailExpandedParentId,
    selectedSourceId,
    allTags,
    allSources,
    tagParentLinks,
  ])

  const railSettingsLabel = useMemo(() => {
    if (!railEditContext) return '설정'
    if (railEditContext.kind === 'parent') return '상위태그 수정'
    if (railEditContext.kind === 'tag') return '태그 수정'
    return '출처 수정'
  }, [railEditContext])

  const openRailSettings = useCallback(() => {
    if (!railEditContext) return
    setRailEditingParentTag(null)
    setRailEditingTag(null)
    setRailEditingSource(null)
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
  const tagSpineSlotRefs = useRef(new Map<string, HTMLButtonElement>())
  const openTracksRef = useRef<HTMLDivElement>(null)
  const openParentSpineRef = useRef<HTMLLIElement>(null)

  useLayoutEffect(() => {
    const section = parentTagRailSectionRef.current
    if (!section) return

    if (homeBrowseNavRef.current === 'tags') {
      section.style.removeProperty('--parent-open-slot-width')
      return
    }

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
    setAddNoteOpen(true)
  }

  function closeAddNote() {
    setAddNoteOpen(false)
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
    applyTagFilterFromUI(tagId, { keepSearch: true, focusNoteBoard: true })
  }

  if (loading && !loadError) {
    return (
      <AppSplashScreen
        message="태그와 메모를 불러오는 중…"
        where="HomePage · initial-data-load"
      />
    )
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
              showHomeFilterBar || showTagViewDetail
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
                    selectedTag && showTagFilteredNoteBoard
                      ? ' home-filter-mode--tag'
                      : ' home-filter-mode--source'
                  }`}
                  role="status"
                >
                  {selectedTag && showTagFilteredNoteBoard ? (
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
                {loading && !homeDataInitialLoadDoneRef.current ? (
                  <HomeTagGridLoadingHint />
                ) : selectedSourceId &&
                  sourcePullLoading &&
                  notesForSelectedSource.length === 0 ? (
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
          }${effectiveShowBrowseRail || showSearchRail ? ' home-main--parent-rail-hero' : ''}`}
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

          {effectiveShowBrowseRail ? (
            <section
              ref={parentTagRailSectionRef}
              className={`parent-tag-rail-section${
                showTagRailIndex ? ' parent-tag-rail-section--with-index' : ''
              }${railSectionOpen ? ' parent-tag-rail-section--open' : ''}${
                homeBrowseNav === 'tags' ? ' parent-tag-rail-section--tag-view' : ''
              }${
                homeBrowseNav === 'dates' ? ' parent-tag-rail-section--date-view' : ''
              }${
                homeBrowseNav === 'books' ? ' parent-tag-rail-section--books-view' : ''
              }`}
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
              {homeBrowseNav === 'tags' ? (
                <div className="tag-view-rail-layout">
                  <div
                    ref={parentTagRailScrollRef}
                    className="tag-view-bar-scroll"
                    aria-label="태그 목록"
                  >
                    <div className="tag-view-bar-list" role="list">
                      <div className="tag-view-bar-block" role="listitem">
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) {
                              tagSpineSlotRefs.current.set(TAG_VIEW_NONE_ID, el)
                            } else {
                              tagSpineSlotRefs.current.delete(TAG_VIEW_NONE_ID)
                            }
                          }}
                          className={`tag-view-bar${
                            selectedTagId === TAG_VIEW_NONE_ID
                              ? ' tag-view-bar--selected'
                              : ''
                          }`}
                          aria-pressed={selectedTagId === TAG_VIEW_NONE_ID}
                          onClick={() => toggleTagSelect(TAG_VIEW_NONE_ID)}
                        >
                          <span className="tag-view-bar-label">태그 없음</span>
                          <span className="tag-view-bar-stat">
                            {tagViewNoneMemoCount}
                          </span>
                        </button>
                      </div>
                      {tagsForTagModeRail.map((t) => {
                        const isSelected = selectedTagId === t.id
                        const memoCount = tagMemoCounts.get(t.id) ?? 0
                        return (
                          <div
                            key={t.id}
                            className="tag-view-bar-block"
                            role="listitem"
                          >
                            <button
                              type="button"
                              ref={(el) => {
                                if (el) tagSpineSlotRefs.current.set(t.id, el)
                                else tagSpineSlotRefs.current.delete(t.id)
                              }}
                              className={`tag-view-bar${
                                isSelected ? ' tag-view-bar--selected' : ''
                              }`}
                              aria-pressed={isSelected}
                              aria-label={displayTagName(t.name)}
                              title={displayTagName(t.name)}
                              onClick={() => toggleTagSelect(t.id)}
                            >
                              <span className="tag-view-bar-label">
                                {displayTagName(t.name)}
                              </span>
                              <span className="tag-view-bar-stat">
                                {memoCount}
                              </span>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : homeBrowseNav === 'dates' ? (
                <HomeDateViewRail
                  groups={notesByDateGroups}
                  selectedDateKey={selectedDateKey}
                  scrollRef={parentTagRailScrollRef}
                  openTracksRef={openTracksRef}
                  slotRef={(dateKey, el) => {
                    const mapKey = `date:${dateKey}`
                    if (el) tagSpineSlotRefs.current.set(mapKey, el)
                    else tagSpineSlotRefs.current.delete(mapKey)
                  }}
                  InlineNotesPanel={InlineRailNotesPanel}
                  onSelectDate={toggleDateSelect}
                  onViewNote={openViewNote}
                  onTagFilter={openTagViewFromNote}
                />
              ) : (
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
                      const parentMemoCount = tagMemoCounts.get(t.id) ?? 0
                      const spineStatValue =
                        childCount > 0 ? childCount : parentMemoCount
                      const spineStatAria =
                        childCount > 0
                          ? `하위 태그 ${childCount}개`
                          : `메모 ${parentMemoCount}개`
                      const parentPullKey = tagPullCacheKey([t.id])
                      const parentCached = tagPullCacheRef.current.get(
                        parentPullKey,
                      )
                      const parentNotesSource =
                        tagPullEntry?.tagId === t.id &&
                        tagPullEntry.nav === 'books'
                          ? tagPullEntry.notes
                          : mergeNotesById(
                              notes,
                              parentCached?.notes ?? [],
                            )
                      const parentDirectNotes =
                        children.length > 0
                          ? filterNotesForParentOnlyUnderParent(
                              parentNotesSource,
                              t.id,
                              allTags,
                              tagParentLinks,
                            )
                          : filterNotesForSingleTagId(parentNotesSource, t.id)
                      const showParentDirectNotes =
                        isOpen &&
                        (children.length === 0
                          ? parentMemoCount > 0 ||
                            parentDirectNotes.length > 0 ||
                            selectedTagId === t.id
                          : parentDirectNotes.length > 0)
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
                              {isOpen ? (
                                <button
                                  type="button"
                                  className="parent-tag-spine-book-btn"
                                  aria-label={`${displayTagName(t.name)} 책 보기`}
                                  title="책 보기"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setBookReaderParentId(t.id)
                                  }}
                                >
                                  <img
                                    src={bookOpenIconUrl}
                                    alt=""
                                    className="parent-tag-spine-book-icon"
                                    width={18}
                                    height={18}
                                    decoding="async"
                                  />
                                </button>
                              ) : null}
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
                                value={spineStatValue}
                                ariaLabel={spineStatAria}
                              />
                            </div>
                            {isOpen ? (
                              <div
                                ref={openTracksRef}
                                className="parent-tag-inline-tracks"
                                aria-label={`${displayTagName(t.name)} 메모·하위 태그`}
                              >
                                {children.length > 0 ? (
                                  <>
                                    <ul
                                      className="parent-tag-child-list"
                                      aria-label={`${displayTagName(t.name)} 하위 태그`}
                                    >
                                      {children.map((child) => {
                                        const childActive =
                                          selectedTagId === child.id
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
                                              aria-expanded={childActive}
                                              onClick={() =>
                                                toggleTagSelect(child.id, {
                                                  childOfParentId: t.id,
                                                })
                                              }
                                            >
                                              <span className="parent-tag-child-label">
                                                {displayTagName(child.name)}
                                              </span>
                                            </button>
                                            {childActive ? (
                                              <InlineRailNotesPanel
                                                tagLabel={displayTagName(
                                                  child.name,
                                                )}
                                                tagId={child.id}
                                                notes={notesForSelectedTag}
                                                loading={tagPullLoading}
                                                onView={openViewNote}
                                                onTagFilter={openTagViewFromNote}
                                                sheetLayout
                                              />
                                            ) : null}
                                          </li>
                                        )
                                      })}
                                    </ul>
                                    {showParentDirectNotes ? (
                                      <InlineRailNotesPanel
                                        tagLabel={displayTagName(t.name)}
                                        tagId={t.id}
                                        notes={parentDirectNotes}
                                        loading={false}
                                        onView={openViewNote}
                                        onTagFilter={openTagViewFromNote}
                                        sheetLayout
                                        sheetHideParentTagId={t.id}
                                      />
                                    ) : null}
                                  </>
                                ) : showParentDirectNotes ? (
                                  <InlineRailNotesPanel
                                    tagLabel={displayTagName(t.name)}
                                    tagId={t.id}
                                    notes={
                                      selectedTagId === t.id
                                        ? notesForSelectedTag
                                        : parentDirectNotes
                                    }
                                    loading={
                                      selectedTagId === t.id &&
                                      tagPullLoading &&
                                      parentDirectNotes.length === 0
                                    }
                                    onView={openViewNote}
                                    onTagFilter={openTagViewFromNote}
                                    sheetLayout
                                    sheetHideParentTagId={t.id}
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
                                  <ul
                                    className="parent-tag-child-list"
                                    aria-label={`${displaySourceTitle(s.title)} 관련 태그`}
                                  >
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
                                              tagLabel={displayTagName(
                                                tag.name,
                                              )}
                                              tagId={tag.id}
                                              notes={notesForLinkModeTag}
                                              loading={tagPullLoading}
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
              )}
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

          {!showBootstrap && showTagViewDetail ? (
            <header className="tag-view-detail-head" aria-label="태그 메모">
              <button
                type="button"
                className="tag-view-detail-back"
                onClick={() => goBackToTagList()}
              >
                <span className="tag-view-detail-back-icon" aria-hidden="true">
                  ←
                </span>
                태그 목록
              </button>
              <div className="tag-view-detail-title-wrap">
                <h2 className="tag-view-detail-title">{tagViewDetailLabel}</h2>
                <p className="tag-view-detail-desc">
                  {selectedTagId === TAG_VIEW_NONE_ID
                    ? '태그가 없는 메모'
                    : selectedTagIsParent
                      ? '이 상위 태그·하위 태그가 붙은 메모'
                      : '이 태그가 붙은 메모'}
                </p>
              </div>
            </header>
          ) : null}

          {!showBootstrap && showTagFilteredNoteBoard ? (
            <section
              className="note-board-section"
              aria-busy={tagPullLoading}
              aria-label={
                selectedTagId === TAG_VIEW_NONE_ID
                  ? '태그 없음 메모'
                  : selectedTag
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
            </section>
          ) : null}

          {!showBootstrap && selectedSourceId && !effectiveShowBrowseRail ? (
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
          initialTags={addNoteCompose.initialTags}
          lockedParentTagId={addNoteCompose.lockedParentTagId}
          childTagCompose={addNoteCompose.childTagCompose}
          allTags={allTags}
          tagParentLinks={tagParentLinks}
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
        onTagError={(message) => setSaveError(message)}
        onSyncFromServer={syncAllFromServer}
        onSourcesChanged={refreshSourcesInUse}
      />

      {user ? (
        <AddParentTagModal
          open={addParentTagRailOpen}
          userId={user.id}
          allTags={allTags}
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
        <ParentTagBookReaderModal
          open={bookReaderParentId !== null}
          parentTagId={bookReaderParentId ?? ''}
          parentTagName={bookReaderParentTag?.name ?? ''}
          notes={bookReaderNotes}
          onClose={() => setBookReaderParentId(null)}
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
          onEdit={(note) => openEditNote(note, viewingNoteContextTagId)}
          onSourceFilter={openSourceViewFromNote}
          onTagFilter={openTagViewFromNote}
        />
      ) : null}

      {user ? (
        <EditNoteModal
          open={editingNote !== null}
          onClose={() => {
            setEditingNote(null)
            setEditingNoteLockedParentTagId(null)
          }}
          note={editingNote}
          lockedParentTagId={editingNoteLockedParentTagId}
          allTags={allTags}
          tagParentLinks={tagParentLinks}
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
