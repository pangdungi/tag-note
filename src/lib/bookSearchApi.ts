import type { BookSearchHit } from './bookCatalogServer'

export type { BookSearchHit }

export async function searchBooks(query: string): Promise<BookSearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`)
  const raw = await res.text()
  let json: { hits?: BookSearchHit[]; error?: string }
  try {
    json = JSON.parse(raw) as { hits?: BookSearchHit[]; error?: string }
  } catch {
    throw new Error(
      '도서 검색 서버 응답이 올바르지 않습니다. 터미널에서 실행 중인 dev 서버를 한 번 종료(Ctrl+C)한 뒤 npm run dev로 다시 켜 주세요.',
    )
  }
  if (!res.ok) {
    throw new Error(json.error ?? '도서 검색에 실패했습니다.')
  }
  return json.hits ?? []
}
