import type {
  BookSearchHit,
  Yes24BookPhysicalSize,
} from './bookCatalogServer'

export type { BookSearchHit, Yes24BookPhysicalSize }

export async function fetchBookPhysicalSize(opts: {
  goodsNo?: string
  isbn?: string
}): Promise<Yes24BookPhysicalSize | null> {
  const params = new URLSearchParams()
  if (opts.goodsNo?.trim()) params.set('goodsNo', opts.goodsNo.trim())
  if (opts.isbn?.trim()) params.set('isbn', opts.isbn.trim())
  if ([...params.keys()].length === 0) return null

  const res = await fetch(`/api/books/size?${params.toString()}`)
  const json = (await res.json()) as {
    size?: Yes24BookPhysicalSize | null
    error?: string
  }
  if (!res.ok) {
    throw new Error(json.error ?? '책 크기를 불러오지 못했습니다.')
  }
  return json.size ?? null
}

export async function searchBooks(query: string): Promise<BookSearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`)
  const raw = await res.text()
  let json: { hits?: BookSearchHit[]; error?: string }
  try {
    json = JSON.parse(raw) as { hits?: BookSearchHit[]; error?: string }
  } catch {
    throw new Error('도서 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
  if (!res.ok) {
    throw new Error(json.error ?? '도서 검색에 실패했습니다.')
  }
  return json.hits ?? []
}
