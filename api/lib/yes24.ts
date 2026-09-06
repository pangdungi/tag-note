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

export type Yes24BookPhysicalSize = {
  widthMm: number | null
  lengthMm: number | null
  heightMm: number | null
  itemFormat: string | null
}

const YES24_API_BASE = 'https://apis.yes24.com/v1'

function extractIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null
  const compact = raw.replace(/[^0-9Xx]/g, '')
  const match = compact.match(/(?:978|979)\d{10}/)
  return match?.[0] ?? null
}

function yes24CoverImageUrl(goodsNo: string): string {
  return `https://image.yes24.com/goods/${goodsNo}/XL`
}

function yes24SpineImageUrl(goodsNo: string): string {
  return `https://image.yes24.com/goods/${goodsNo}/SIDE/XL`
}

function parseYes24CategoryField(goodsSortNm?: string | null): string {
  const raw = goodsSortNm?.trim() ?? ''
  if (!raw) return ''
  const parts = raw.split('-').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[1] ?? raw
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
  width?: number | null
  length?: number | null
  height?: number | null
  itemFormat?: string | null
}

type Yes24ApiResponse = {
  success?: boolean
  message?: string
  data?: { items?: Yes24GoodsItem[] }
}

function getYes24ApiKey(): string {
  const key = (process.env.YES24_API_KEY ?? process.env.VITE_YES24_API_KEY ?? '').trim()
  if (!key) {
    throw new Error(
      'YES24_API_KEY가 설정되지 않았습니다. Vercel 환경 변수에 예스24 API 키를 넣어 주세요.',
    )
  }
  return key
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

function positiveMm(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null
}

function standingMmFromItemFormat(format?: string | null): number | null {
  const raw = format?.replace(/\s+/g, '') ?? ''
  if (!raw) return null
  if (raw.includes('문고')) return 174
  if (raw.includes('신국판')) return 223
  if (raw.includes('국판')) return 210
  if (raw.includes('사륙')) return 188
  if (/크라운/i.test(raw)) return 256
  if (/A5/i.test(raw)) return 210
  if (/B6/i.test(raw)) return 182
  if (/A4/i.test(raw)) return 297
  return null
}

export async function fetchYes24BookPhysicalSize(opts: {
  goodsNo?: string
  isbn?: string
}): Promise<Yes24BookPhysicalSize | null> {
  const goodsNo = opts.goodsNo?.trim() ?? ''
  const isbn = extractIsbn13(opts.isbn) ?? opts.isbn?.trim() ?? ''
  if (!goodsNo && !isbn) return null

  const json = goodsNo
    ? await yes24ApiGet('/goods/itemDetail', {
        searchType: 'ItemId',
        query: goodsNo,
        detail: 'Y',
      })
    : await yes24ApiGet('/goods/itemDetail', {
        searchType: 'ISBN13',
        query: isbn,
        detail: 'Y',
      })

  const item = json.data?.items?.[0]
  if (!item) return null

  return {
    widthMm: positiveMm(item.width),
    lengthMm:
      positiveMm(item.length) ?? standingMmFromItemFormat(item.itemFormat),
    heightMm: positiveMm(item.height),
    itemFormat: item.itemFormat?.trim() || null,
  }
}
