export type BookSearchHit = {
  isbn: string
  title: string
  author: string
  publisher: string
  category: string
  publishedYear: number | null
  coverUrl: string
  spineUrl: string
  yes24GoodsNo: string
  source: 'yes24'
}

const YES24_API_BASE = 'https://apis.yes24.com/v1'

export function extractIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null
  const compact = raw.replace(/[^0-9Xx]/g, '')
  const match = compact.match(/(?:978|979)\d{10}/)
  return match?.[0] ?? null
}

export function yes24SpineImageUrl(goodsNo: string | number): string {
  return `https://image.yes24.com/goods/${goodsNo}/SIDE/XL`
}

export function yes24CoverImageUrl(goodsNo: string | number): string {
  return `https://image.yes24.com/goods/${goodsNo}/XL`
}

/** DB spine URL → 없으면 yes24_goods_no로 SIDE URL 생성 */
export function resolveSourceSpineUrl(source: {
  spine_image_url?: string | null
  yes24_goods_no?: string | null
}): string | null {
  const direct = source.spine_image_url?.trim()
  if (direct) return direct
  const goodsNo = source.yes24_goods_no?.trim()
  if (goodsNo) return yes24SpineImageUrl(goodsNo)
  return null
}

/** 예스24 goodsSortNm → 분야 (예: "국내도서-IT 모바일" → "IT 모바일") */
export function parseYes24CategoryField(goodsSortNm?: string | null): string {
  const raw = goodsSortNm?.trim() ?? ''
  if (!raw) return ''
  const parts = raw.split('-').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[1]
  return raw
}

type Yes24GoodsItem = {
  itemId?: number
  title?: string
  author?: string
  publisher?: string
  goodsSortNm?: string
  goodsType?: string
  isbn13?: string
  isbn10?: string
  cover?: string
  publishDate?: string
  link?: string
}

type Yes24ApiResponse = {
  success?: boolean
  message?: string
  errorCode?: string | null
  data?: {
    items?: Yes24GoodsItem[]
    currentPage?: number
    pageSize?: number
    totalCount?: number
  }
}

let yes24ApiKeyOverride: string | null = null

/** Vite dev 미들웨어 등에서 .env 키 주입 */
export function configureYes24ApiKey(key: string | null | undefined): void {
  yes24ApiKeyOverride = key?.trim() || null
}

export function getYes24ApiKey(): string {
  if (yes24ApiKeyOverride) return yes24ApiKeyOverride

  try {
    const env = (
      globalThis as unknown as { process?: { env?: Record<string, string> } }
    ).process?.env
    const key = env?.YES24_API_KEY ?? env?.VITE_YES24_API_KEY ?? ''
    const trimmed = key.trim()
    if (trimmed) return trimmed
  } catch {
    /* ignore */
  }

  throw new Error(
    'YES24_API_KEY가 설정되지 않았습니다. developers.yes24.com에서 API Key를 발급받아 .env에 추가하세요.',
  )
}

async function yes24ApiGet(
  path: string,
  params: Record<string, string | number>,
): Promise<Yes24ApiResponse> {
  const url = new URL(`${YES24_API_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': getYes24ApiKey(),
    },
  })

  let json: Yes24ApiResponse
  try {
    json = (await res.json()) as Yes24ApiResponse
  } catch {
    throw new Error(`예스24 API 응답을 읽지 못했습니다 (${res.status})`)
  }

  if (!res.ok) {
    throw new Error(json.message ?? `예스24 API 오류 (${res.status})`)
  }
  if (json.success === false) {
    throw new Error(json.message ?? '예스24 API 요청에 실패했습니다.')
  }

  return json
}

function hitFromYes24Item(item: Yes24GoodsItem): BookSearchHit | null {
  const itemId = item.itemId
  if (itemId == null || !Number.isFinite(itemId)) return null

  const isbn =
    extractIsbn13(item.isbn13) ?? extractIsbn13(item.isbn10) ?? null
  if (!isbn) return null

  const title = item.title?.trim() ?? ''
  if (!title) return null

  const goodsNo = String(itemId)
  const yearMatch = item.publishDate?.match(/^(\d{4})/)

  return {
    isbn,
    title,
    author: item.author?.trim() ?? '',
    publisher: item.publisher?.trim() ?? '',
    category:
      parseYes24CategoryField(item.goodsSortNm) ||
      item.goodsType?.trim() ||
      '',
    publishedYear: yearMatch ? Number.parseInt(yearMatch[1], 10) : null,
    coverUrl: item.cover?.trim() || yes24CoverImageUrl(goodsNo),
    spineUrl: yes24SpineImageUrl(goodsNo),
    yes24GoodsNo: goodsNo,
    source: 'yes24',
  }
}

/** 예스24 Open API — 제목·ISBN 검색 */
export async function searchYes24Books(query: string): Promise<BookSearchHit[]> {
  const keyword = query.trim()
  if (!keyword) return []

  const json = await yes24ApiGet('/goods/itemList', {
    query: keyword,
    page: 1,
    pageSize: 20,
    detail: 'N',
  })

  const hits: BookSearchHit[] = []
  const seen = new Set<string>()

  for (const item of json.data?.items ?? []) {
    const hit = hitFromYes24Item(item)
    if (!hit || seen.has(hit.isbn)) continue
    seen.add(hit.isbn)
    hits.push(hit)
  }

  return hits
}

/** ISBN13으로 예스24 상품 조회 */
export async function lookupYes24ByIsbn(
  isbn: string,
): Promise<BookSearchHit | null> {
  const normalized = extractIsbn13(isbn) ?? isbn.trim()
  if (!normalized) return null

  const json = await yes24ApiGet('/goods/itemDetail', {
    searchType: 'ISBN13',
    query: normalized,
    detail: 'N',
  })

  const item = json.data?.items?.[0]
  if (!item) return null
  return hitFromYes24Item(item)
}

/** @deprecated searchYes24Books 사용 */
export async function searchBooksCatalog(query: string): Promise<BookSearchHit[]> {
  return searchYes24Books(query)
}
