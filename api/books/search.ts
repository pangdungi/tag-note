import { searchYes24Books } from '../../src/lib/bookCatalogServer'
import {
  bookApiCorsHeaders,
  readHeader,
  rejectOrigin,
  sendBookApiJson,
  type BookApiReq,
  type BookApiRes,
} from './_cors'

export default async function handler(req: BookApiReq, res: BookApiRes) {
  const origin = readHeader(req, 'origin')
  const ch = bookApiCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    for (const [key, value] of Object.entries(ch)) res.setHeader(key, value)
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendBookApiJson(res, 405, { error: 'Method not allowed' }, ch)
    return
  }

  if (rejectOrigin(origin)) {
    sendBookApiJson(res, 403, { error: 'Origin not allowed' }, ch)
    return
  }

  const host = readHeader(req, 'host') ?? 'localhost'
  const url = new URL(req.url ?? '/', `https://${host}`)
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    sendBookApiJson(res, 200, { hits: [] }, ch)
    return
  }

  try {
    const hits = await searchYes24Books(q)
    sendBookApiJson(res, 200, { hits }, ch)
  } catch (e) {
    const message =
      e instanceof Error ? e.message : '도서 검색에 실패했습니다.'
    sendBookApiJson(res, 500, { error: message }, ch)
  }
}
