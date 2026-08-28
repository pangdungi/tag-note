import { useCallback, useEffect, useId, useState, startTransition } from 'react'
import { createBookSource, type SourceRow } from '../lib/notesApi'
import {
  fetchBookImages,
  searchBooks,
  type BookSearchHit,
} from '../lib/bookSearchApi'
import { displaySourceTitle } from '../lib/sourceUtils'

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
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BookSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [importingIsbn, setImportingIsbn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setQuery('')
      setHits([])
      setSearching(false)
      setImportingIsbn(null)
      setError(null)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
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
  }, [open, query])

  const handlePick = useCallback(
    async (hit: BookSearchHit) => {
      if (!userId || importingIsbn) return
      setError(null)
      setImportingIsbn(hit.isbn)
      try {
        const { spine, coverUrl } = await fetchBookImages(hit)
        const row = await createBookSource(userId, {
          title: hit.title,
          isbn: hit.isbn,
          author: hit.author || null,
          publisher: hit.publisher || null,
          published_year: hit.publishedYear,
          category: hit.category || null,
          cover_image_url: coverUrl ?? hit.coverUrl ?? null,
          kyobo_product_id: hit.kyoboProductId,
          metadata_source: hit.source,
          spine_image_url: spine?.url ?? null,
          spine_image_width: spine?.width ?? null,
          spine_image_height: spine?.height ?? null,
        })
        onCreated(row, {
          needsSpinePaste: !spine,
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
    [userId, importingIsbn, onCreated, onClose, onError],
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

        <div className="edit-note-modal-body add-book-modal-body">
          <div className="composer-field">
            <label className="composer-label" htmlFor={searchId}>
              책 검색
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
                <p className="add-book-modal-hint">
                  북스파인은 예스24 3D 책등(SIDE)을 우선 사용합니다. 예스24에
                  없을 때만 교보 3번 이미지를 시도합니다. 표지 URL도 함께
                  저장합니다.
                </p>
          </div>

          {searching ? (
            <p className="notes-hint add-book-modal-status">검색 중…</p>
          ) : null}
          {importingIsbn ? (
            <p className="notes-hint add-book-modal-status">
              북스파인 가져오는 중…
            </p>
          ) : null}
          {error ? <p className="composer-error">{error}</p> : null}

          {hits.length > 0 ? (
            <ul className="add-book-result-list">
              {hits.map((hit) => {
                const busy = importingIsbn === hit.isbn
                return (
                  <li key={hit.isbn}>
                    <button
                      type="button"
                      className="add-book-result-item"
                      disabled={Boolean(importingIsbn)}
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
                          {[hit.author, hit.publisher].filter(Boolean).join(' · ')}
                        </span>
                        {hit.category ? (
                          <span className="add-book-result-category">
                            {hit.category}
                          </span>
                        ) : null}
                        <span className="add-book-result-isbn">{hit.isbn}</span>
                      </span>
                      {busy ? (
                        <span className="add-book-result-busy">등록 중…</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : query.trim().length >= 2 && !searching ? (
            <p className="notes-hint add-book-modal-empty">검색 결과가 없습니다.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
