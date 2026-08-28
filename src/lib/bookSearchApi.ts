import type { BookSearchHit } from './bookCatalogServer'
import {
  bookCoverImageUrls,
  bookSpineImageUrls,
} from './bookCatalogServer'
import type { SourceSpineImageData } from './sourceSpineImage'
import { fileToSpineImage } from './sourceSpineImage'

export type { BookSearchHit }

type Yes24Lookup = {
  goodsNo: string
  spineUrl: string
  coverUrl: string
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
    throw new Error(
      '도서 검색 서버 응답이 올바르지 않습니다. 터미널에서 실행 중인 dev 서버를 한 번 종료(Ctrl+C)한 뒤 npm run dev로 다시 켜 주세요.',
    )
  }
  if (!res.ok) {
    throw new Error(json.error ?? '도서 검색에 실패했습니다.')
  }
  return json.hits ?? []
}

async function lookupYes24(isbn: string): Promise<Yes24Lookup | null> {
  try {
    const res = await fetch(
      `/api/books/yes24?isbn=${encodeURIComponent(isbn)}`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as Partial<Yes24Lookup>
    if (!json.goodsNo || !json.spineUrl) return null
    return json as Yes24Lookup
  } catch {
    return null
  }
}

async function fetchProxiedImageBlob(imageUrl: string): Promise<Blob> {
  const res = await fetch(
    `/api/books/image?url=${encodeURIComponent(imageUrl)}`,
  )
  if (!res.ok) {
    let message = '이미지를 가져오지 못했습니다.'
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* binary error body */
    }
    throw new Error(message)
  }
  return res.blob()
}

/** 세로 띠(북스파인) 비율 — 표지·가로 이미지는 제외 */
function isLikelySpineImage(data: SourceSpineImageData): boolean {
  if (data.width < 8 || data.height < 80) return false
  const ratio = data.width / data.height
  return ratio > 0.02 && ratio <= 0.28
}

function isYes24SpineUrl(url: string): boolean {
  return url.includes('image.yes24.com') && url.includes('/SIDE/')
}

export type BookImagesFetchResult = {
  spine: SourceSpineImageData | null
  coverUrl: string | null
}

/** 북스파인(예스24 SIDE → 교보 3번) + 표지 URL */
export async function fetchBookImages(
  hit: Pick<BookSearchHit, 'isbn' | 'coverUrl' | 'kyoboProductId'>,
): Promise<BookImagesFetchResult> {
  const yes24 = await lookupYes24(hit.isbn)

  const spineUrls = bookSpineImageUrls(
    hit.isbn,
    hit.kyoboProductId,
    yes24?.goodsNo,
  )
  let spine: SourceSpineImageData | null = null
  let lastSpineError: Error | null = null
  for (const url of spineUrls) {
    try {
      const blob = await fetchProxiedImageBlob(url)
      if (blob.size < 2000) {
        throw new Error('북스파인 이미지가 비어 있습니다.')
      }
      const file = new File([blob], `${hit.isbn}_spine.jpg`, {
        type: blob.type || 'image/jpeg',
      })
      const candidate = await fileToSpineImage(file)
      if (!isYes24SpineUrl(url) && !isLikelySpineImage(candidate)) {
        throw new Error('북스파인 비율이 아닙니다 (표지·부가 이미지).')
      }
      spine = candidate
      break
    } catch (e) {
      lastSpineError = e instanceof Error ? e : new Error(String(e))
    }
  }

  if (!spine) {
    console.warn('[태그노트] 북스파인 실패 (교보·예스24)', {
      isbn: hit.isbn,
      lastError: lastSpineError?.message,
    })
  }

  const coverCandidates = bookCoverImageUrls(
    hit.isbn,
    hit.coverUrl,
    yes24?.goodsNo,
  )
  let coverUrl: string | null = null
  for (const url of coverCandidates) {
    try {
      await fetchProxiedImageBlob(url)
      coverUrl = url
      break
    } catch {
      /* try next */
    }
  }

  return { spine, coverUrl }
}

/** @deprecated fetchBookImages 사용 */
export async function fetchBookSpineImage(
  hit: Pick<BookSearchHit, 'isbn' | 'coverUrl' | 'kyoboProductId'>,
): Promise<SourceSpineImageData | null> {
  const { spine } = await fetchBookImages(hit)
  return spine
}
