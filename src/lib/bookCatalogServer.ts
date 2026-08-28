export type BookSearchHit = {
  isbn: string
  title: string
  author: string
  publisher: string
  category: string
  publishedYear: number | null
  coverUrl: string
  spineUrl: string
  kyoboProductId: string | null
  source: 'kakao' | 'kyobo'
}

const KYOBO_SEARCH =
  'https://search.kyobobook.co.kr/srp/api/v1/search/autocomplete/shop'

export function extractIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null
  const compact = raw.replace(/[^0-9Xx]/g, '')
  const match = compact.match(/(?:978|979)\d{10}/)
  return match?.[0] ?? null
}

export function kyoboCoverUrl(isbn: string): string {
  return `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/${isbn}.jpg`
}

/** 교보문고 상품 갤러리 3번째(addt_02) = 북스파인 — 무조건 이 URL만 사용 */
export function kyoboSpineUrl(isbn: string): string {
  return kyoboAddtSpineImageUrl(isbn)
}

/** 갤러리: 1=표지(pdt), 2=addt_01, 3=addt_02(북스파인) */
export function kyoboAddtSpineImageUrl(isbn: string, size = '458x0'): string {
  return `https://contents.kyobobook.co.kr/sih/fit-in/${size}/pdt/addt/${isbn}_02.jpg`
}

/** 갤러리 3번(addt_02) — ISBN 우선, 없으면 saleCmdtId */
export function kyoboSpineImageUrls(
  isbn: string,
  productId?: string | null,
): string[] {
  const urls = [kyoboAddtSpineImageUrl(isbn)]
  const pid = productId?.trim()
  if (pid) {
    urls.push(
      `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/addt/${pid}_02.jpg`,
    )
  }
  return [...new Set(urls)]
}

/** @deprecated kyoboSpineImageUrls — HMR/구 import 호환 */
export const kyoboSpineCandidateUrls = kyoboSpineImageUrls

const YES24_SEARCH =
  'https://www.yes24.com/Product/searchapi/bulletsearch/goods'

export function yes24SpineImageUrl(goodsNo: string | number): string {
  return `https://image.yes24.com/goods/${goodsNo}/SIDE/XL`
}

export function yes24CoverImageUrl(goodsNo: string | number): string {
  return `https://image.yes24.com/goods/${goodsNo}/XL`
}

type Yes24Lookup = {
  goodsNo: string
  spineUrl: string
  coverUrl: string
}

/** ISBN·제목으로 예스24 GOODS_NO 조회 */
export async function lookupYes24ByIsbn(isbn: string): Promise<Yes24Lookup | null> {
  const keyword = isbn.trim()
  if (!keyword) return null

  const res = await fetch(
    `${YES24_SEARCH}?query=${encodeURIComponent(keyword)}`,
    {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.yes24.com/',
      },
    },
  )
  if (!res.ok) return null

  const json = (await res.json()) as {
    lstSearchKeywordResult?: Array<{
      GOODDS_INDEXES?: { GOODS_NO?: number | string; ISBN?: string }
    }>
  }

  const results = json.lstSearchKeywordResult ?? []
  const normalizedIsbn = extractIsbn13(keyword) ?? keyword

  for (const row of results) {
    const idx = row.GOODDS_INDEXES
    const goodsNo = idx?.GOODS_NO
    if (goodsNo == null || String(goodsNo).trim() === '') continue
    const rowIsbn = extractIsbn13(String(idx?.ISBN ?? ''))
    if (rowIsbn && rowIsbn !== normalizedIsbn) continue
    const id = String(goodsNo)
    return {
      goodsNo: id,
      spineUrl: yes24SpineImageUrl(id),
      coverUrl: yes24CoverImageUrl(id),
    }
  }

  const first = results[0]?.GOODDS_INDEXES?.GOODS_NO
  if (first == null || String(first).trim() === '') return null
  const id = String(first)
  return {
    goodsNo: id,
    spineUrl: yes24SpineImageUrl(id),
    coverUrl: yes24CoverImageUrl(id),
  }
}

/** 예스24 SIDE(3D 책등) → 교보 addt_02 fallback */
export function bookSpineImageUrls(
  isbn: string,
  kyoboProductId?: string | null,
  yes24GoodsNo?: string | null,
): string[] {
  const urls: string[] = []
  const yes24Id = yes24GoodsNo?.trim()
  if (yes24Id) urls.push(yes24SpineImageUrl(yes24Id))
  urls.push(...kyoboSpineImageUrls(isbn, kyoboProductId))
  return [...new Set(urls)]
}

/** 예스24 XL → 교보 표지 fallback */
export function bookCoverImageUrls(
  isbn: string,
  preferredCover?: string | null,
  yes24GoodsNo?: string | null,
): string[] {
  const urls: string[] = []
  const yes24Id = yes24GoodsNo?.trim()
  if (yes24Id) urls.push(yes24CoverImageUrl(yes24Id))
  const preferred = preferredCover?.trim()
  if (preferred) urls.push(preferred)
  urls.push(kyoboCoverUrl(isbn))
  return [...new Set(urls)]
}

const KYOBO_IMAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  Referer: 'https://product.kyobobook.co.kr/',
}

function parseKyoboRelateHtml(raw: string): Partial<BookSearchHit> | null {
  if (!raw.trim()) return null
  const p = raw.split('$@')
  const isbn = extractIsbn13(p[0]) ?? p[0]?.trim()
  if (!isbn) return null
  const year = Number.parseInt(p[5] ?? '', 10)
  const coverFromField =
    p.find((part) => part.startsWith('https://contents.kyobobook.co.kr/')) ??
    null
  return {
    isbn,
    category: p[1]?.trim() ?? '',
    title: p[2]?.trim() ?? '',
    author: p[3]?.trim() ?? '',
    publisher: p[4]?.trim() ?? '',
    publishedYear: Number.isFinite(year) ? year : null,
    coverUrl: coverFromField ?? kyoboCoverUrl(isbn),
    spineUrl: kyoboSpineUrl(isbn),
  }
}

type KyoboDoc = {
  CMDTCODE?: string
  CMDT_NAME?: string
  SALE_CMDTID?: string
  TOT_RELATE_HTML_LIST?: string
}

function hitFromKyoboDoc(doc: KyoboDoc): BookSearchHit | null {
  const parsed = parseKyoboRelateHtml(doc.TOT_RELATE_HTML_LIST ?? '')
  const isbn =
    extractIsbn13(doc.CMDTCODE) ??
    parsed?.isbn ??
    extractIsbn13(doc.TOT_RELATE_HTML_LIST)
  if (!isbn) return null

  const title = parsed?.title || doc.CMDT_NAME?.trim() || ''
  if (!title) return null

  return {
    isbn,
    title,
    author: parsed?.author ?? '',
    publisher: parsed?.publisher ?? '',
    category: parsed?.category ?? '',
    publishedYear: parsed?.publishedYear ?? null,
    coverUrl: parsed?.coverUrl ?? kyoboCoverUrl(isbn),
    spineUrl: kyoboSpineUrl(isbn),
    kyoboProductId: doc.SALE_CMDTID?.trim() || null,
    source: 'kyobo',
  }
}

export async function searchKyoboBooks(query: string): Promise<BookSearchHit[]> {
  const keyword = query.trim()
  if (!keyword) return []

  const url = `${KYOBO_SEARCH}?keyword=${encodeURIComponent(keyword)}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; TagNote/1.0)',
    },
  })
  if (!res.ok) {
    throw new Error(`교보문고 검색 실패 (${res.status})`)
  }

  const json = (await res.json()) as {
    data?: { resultDocuments?: KyoboDoc[] }
  }
  const docs = json.data?.resultDocuments ?? []
  const hits: BookSearchHit[] = []
  const seen = new Set<string>()

  for (const doc of docs) {
    const hit = hitFromKyoboDoc(doc)
    if (!hit || seen.has(hit.isbn)) continue
    seen.add(hit.isbn)
    hits.push(hit)
  }
  return hits
}

type KakaoBookDoc = {
  title?: string
  authors?: string[]
  publisher?: string
  datetime?: string
  isbn?: string
  thumbnail?: string
  contents?: string
}

export async function searchKakaoBooks(
  query: string,
  restApiKey: string,
): Promise<BookSearchHit[]> {
  const keyword = query.trim()
  if (!keyword) return []

  const url = `https://dapi.kakao.com/v3/search/book?target=title&size=15&query=${encodeURIComponent(keyword)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${restApiKey}`,
    },
  })
  if (!res.ok) {
    throw new Error(`카카오 도서 검색 실패 (${res.status})`)
  }

  const json = (await res.json()) as { documents?: KakaoBookDoc[] }
  const hits: BookSearchHit[] = []
  const seen = new Set<string>()

  for (const doc of json.documents ?? []) {
    const isbn = extractIsbn13(doc.isbn)
    const title = doc.title?.trim() ?? ''
    if (!isbn || !title) continue
    if (seen.has(isbn)) continue
    seen.add(isbn)

    const yearMatch = doc.datetime?.match(/^(\d{4})/)
    hits.push({
      isbn,
      title,
      author: (doc.authors ?? []).join(', '),
      publisher: doc.publisher?.trim() ?? '',
      category: '',
      publishedYear: yearMatch ? Number.parseInt(yearMatch[1], 10) : null,
      coverUrl: doc.thumbnail?.trim() || kyoboCoverUrl(isbn),
      spineUrl: kyoboSpineUrl(isbn),
      kyoboProductId: null,
      source: 'kakao',
    })
  }
  return hits
}

function mergeBookHits(primary: BookSearchHit[], secondary: BookSearchHit[]) {
  const map = new Map<string, BookSearchHit>()
  for (const hit of primary) map.set(hit.isbn, hit)
  for (const hit of secondary) {
    const prev = map.get(hit.isbn)
    if (!prev) {
      map.set(hit.isbn, hit)
      continue
    }
    map.set(hit.isbn, {
      ...prev,
      category: prev.category || hit.category,
      author: prev.author || hit.author,
      publisher: prev.publisher || hit.publisher,
      publishedYear: prev.publishedYear ?? hit.publishedYear,
      coverUrl: prev.coverUrl || hit.coverUrl,
      kyoboProductId: prev.kyoboProductId ?? hit.kyoboProductId,
    })
  }
  return [...map.values()]
}

export async function searchBooksCatalog(
  query: string,
  kakaoRestApiKey?: string | null,
): Promise<BookSearchHit[]> {
  const kyoboHits = await searchKyoboBooks(query)

  if (!kakaoRestApiKey?.trim()) {
    return kyoboHits.slice(0, 20)
  }

  try {
    const kakaoHits = await searchKakaoBooks(query, kakaoRestApiKey.trim())
    return mergeBookHits(kakaoHits, kyoboHits).slice(0, 20)
  } catch {
    return kyoboHits.slice(0, 20)
  }
}

const ALLOWED_IMAGE_HOSTS = new Set([
  'contents.kyobobook.co.kr',
  'image.kyobobook.co.kr',
  'image.yes24.com',
  'search1.kakaocdn.net',
  'img1.daumcdn.net',
])

function bookImageRequestHeaders(url: string): Record<string, string> {
  if (url.includes('image.yes24.com')) {
    return {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.yes24.com/',
    }
  }
  return KYOBO_IMAGE_HEADERS
}

export function isAllowedBookImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    return ALLOWED_IMAGE_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export async function fetchBookImageBytes(url: string): Promise<{
  bytes: ArrayBuffer
  contentType: string
}> {
  if (!isAllowedBookImageUrl(url)) {
    throw new Error('허용되지 않은 이미지 주소입니다.')
  }

  const res = await fetch(url, { headers: bookImageRequestHeaders(url) })
  if (!res.ok) {
    throw new Error(`이미지를 가져오지 못했습니다 (${res.status})`)
  }

  const bytes = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (bytes.byteLength < 500) {
    throw new Error('이미지가 비어 있습니다.')
  }
  return { bytes, contentType }
}

export async function fetchFirstBookImageBytes(
  urls: string[],
): Promise<{ bytes: ArrayBuffer; contentType: string; url: string }> {
  let lastError: Error | null = null
  for (const url of urls) {
    try {
      const result = await fetchBookImageBytes(url)
      return { ...result, url }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastError ?? new Error('북스파인 이미지를 가져오지 못했습니다.')
}
