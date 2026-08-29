import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  startTransition,
  type FormEvent,
} from 'react'
import { createBookSource, createManualSource, type SourceRow } from '../lib/notesApi'
import {
  fetchBookPhysicalSize,
  searchBooks,
  type BookSearchHit,
} from '../lib/bookSearchApi'
import {
  displaySourceTitle,
  SOURCE_CATEGORY_OPTIONS,
  SOURCE_CATEGORY_UNCategorized,
} from '../lib/sourceUtils'
import { ModalFooter } from './ModalFooter'
import { ModalSelect } from './ModalSelect'
import { ModalSegmentTabs } from './ModalSegmentTabs'

type AddBookTab = 'search' | 'manual'

const ADD_BOOK_TABS = [
  { id: 'search' as const, label: '책 검색' },
  { id: 'manual' as const, label: '직접 입력' },
]

type Props = {
  open: boolean
  userId: string | null
  onClose: () => void
  onCreated: (
    row: SourceRow,
    options?: { needsSpinePaste?: boolean },
  ) => void
  onError?: (message: string) => void
}

export function AddBookModal({
  open,
  userId,
  onClose,
  onCreated,
  onError,
}: Props) {
  const titleId = useId()
  const searchId = useId()
  const manualTitleId = useId()
  const manualCategoryId = useId()
  const [tab, setTab] = useState<AddBookTab>('search')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BookSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [importingIsbn, setImportingIsbn] = useState<string | null>(null)
  const [manualTitle, setManualTitle] = useState('')
  const [manualCategory, setManualCategory] = useState<string>(
    SOURCE_CATEGORY_UNCategorized,
  )
  const [manualSaving, setManualSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = Boolean(importingIsbn || manualSaving)

  const manualCategoryOptions = useMemo(
    () =>
      SOURCE_CATEGORY_OPTIONS.filter(
        (option) => option !== SOURCE_CATEGORY_UNCategorized,
      ).map((option) => ({ value: option, label: option })),
    [],
  )

  const manualCategoryValue =
    manualCategory === SOURCE_CATEGORY_UNCategorized ? '' : manualCategory

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setTab('search')
      setQuery('')
      setHits([])
      setSearching(false)
      setImportingIsbn(null)
      setManualTitle('')
      setManualCategory(SOURCE_CATEGORY_UNCategorized)
      setManualSaving(false)
      setError(null)
    })
  }, [open])

  useEffect(() => {
    if (!open || tab !== 'search') return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await searchBooks(q)
          setHits(next)
          setError(null)
        } catch (e) {
          setHits([])
          setError(
            e instanceof Error ? e.message : '도서 검색에 실패했습니다.',
          )
        } finally {
          setSearching(false)
        }
      })()
    }, 320)

    return () => window.clearTimeout(timer)
  }, [open, tab, query])

  const handlePick = useCallback(
    async (hit: BookSearchHit) => {
      if (!userId || busy) return
      setError(null)
      setImportingIsbn(hit.isbn)
      try {
        const size = await fetchBookPhysicalSize({
          goodsNo: hit.yes24GoodsNo,
          isbn: hit.isbn,
        }).catch(() => null)
        const row = await createBookSource(userId, {
          title: hit.title,
          isbn: hit.isbn,
          author: hit.author || null,
          publisher: hit.publisher || null,
          published_year: hit.publishedYear,
          category: hit.category || null,
          cover_image_url: hit.coverUrl || null,
          yes24_goods_no: hit.yes24GoodsNo,
          metadata_source: hit.source,
          spine_image_url: hit.spineUrl || null,
          book_width_mm: size?.widthMm ?? null,
          book_length_mm: size?.lengthMm ?? null,
          book_height_mm: size?.heightMm ?? null,
        })
        onCreated(row, {
          needsSpinePaste: !hit.spineUrl,
        })
        onClose()
      } catch (e) {
        const message =
          e instanceof Error ? e.message : '책을 등록하지 못했습니다.'
        setError(message)
        onError?.(message)
      } finally {
        setImportingIsbn(null)
      }
    },
    [userId, busy, onCreated, onClose, onError],
  )

  const handleManualSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      if (!userId || busy) return
      const title = manualTitle.trim()
      if (!title) {
        setError('책 제목을 입력해 주세요.')
        return
      }
      setError(null)
      setManualSaving(true)
      try {
        const row = await createManualSource(userId, {
          title,
          category: manualCategory,
        })
        onCreated(row, { needsSpinePaste: true })
        onClose()
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '책을 등록하지 못했습니다.'
        setError(message)
        onError?.(message)
      } finally {
        setManualSaving(false)
      }
    },
    [
      userId,
      busy,
      manualTitle,
      manualCategory,
      onCreated,
      onClose,
      onError,
    ],
  )

  if (!open) return null

  return (
    <div className="tag-manage-overlay" role="presentation">
      <div
        className="tag-manage-backdrop"
        aria-hidden="true"
        onClick={() => onClose()}
      />
      <div
        className="tag-manage-dialog tag-manage-dialog--edit-tag tag-manage-dialog--add-book"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            책 추가
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="책 추가 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>

        <ModalSegmentTabs
          tabs={ADD_BOOK_TABS}
          activeId={tab}
          ariaLabel="책 추가 방식"
          onChange={(id) => setTab(id as AddBookTab)}
        />

        <div
          className={`edit-note-modal-body add-book-modal-body${
            tab === 'search' ? ' add-book-modal-body--search' : ''
          }`}
        >
          {tab === 'search' ? (
            <>
              <div className="composer-field">
                <label className="composer-label" htmlFor={searchId}>
                  검색어
                </label>
                <input
                  id={searchId}
                  type="search"
                  className="composer-source"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="제목, 저자, ISBN"
                  autoComplete="off"
                  spellCheck={false}
                autoFocus
              />
            </div>

              {searching ? (
                <p className="notes-hint add-book-modal-status">검색 중…</p>
              ) : null}
              {importingIsbn ? (
                <p className="notes-hint add-book-modal-status">등록 중…</p>
              ) : null}

              {hits.length > 0 ? (
                <ul className="add-book-result-list">
                  {hits.map((hit) => {
                    const itemBusy = importingIsbn === hit.isbn
                    return (
                      <li key={hit.isbn}>
                        <button
                          type="button"
                          className="add-book-result-item"
                          disabled={busy}
                          onClick={() => void handlePick(hit)}
                        >
                          <span className="add-book-result-cover-wrap">
                            {hit.coverUrl ? (
                              <img
                                src={hit.coverUrl}
                                alt=""
                                className="add-book-result-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="add-book-result-cover-fallback" />
                            )}
                          </span>
                          <span className="add-book-result-meta">
                            <span className="add-book-result-title">
                              {displaySourceTitle(hit.title)}
                            </span>
                            <span className="add-book-result-sub">
                              {[hit.author, hit.publisher]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            {hit.category ? (
                              <span className="add-book-result-category">
                                {hit.category}
                              </span>
                            ) : null}
                            <span className="add-book-result-isbn">
                              {hit.isbn}
                            </span>
                          </span>
                          {itemBusy ? (
                            <span className="add-book-result-busy">
                              등록 중…
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : query.trim().length >= 2 && !searching ? (
                <p className="notes-hint add-book-modal-empty">
                  검색 결과가 없습니다.
                </p>
              ) : null}
            </>
          ) : (
            <form
              className="add-book-manual-form"
              onSubmit={(e) => void handleManualSubmit(e)}
            >
              <div className="composer-field">
                <label className="composer-label" htmlFor={manualTitleId}>
                  책 제목
                </label>
                <input
                  id={manualTitleId}
                  type="text"
                  className="composer-source"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="책 제목을 입력"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  disabled={busy}
                />
              </div>
              <div className="composer-field">
                <label className="composer-label" htmlFor={manualCategoryId}>
                  분야
                </label>
                <ModalSelect
                  id={manualCategoryId}
                  value={manualCategoryValue}
                  options={manualCategoryOptions}
                  emptyLabel={SOURCE_CATEGORY_UNCategorized}
                  disabled={busy}
                  onChange={(next) =>
                    setManualCategory(next || SOURCE_CATEGORY_UNCategorized)
                  }
                />
              </div>
            </form>
          )}

          {error ? <p className="composer-error">{error}</p> : null}
        </div>

        {tab === 'manual' ? (
          <ModalFooter align="end">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !manualTitle.trim()}
              onClick={() => void handleManualSubmit()}
            >
              {manualSaving ? '등록 중…' : '직접 추가'}
            </button>
          </ModalFooter>
        ) : null}
      </div>
    </div>
  )
}
