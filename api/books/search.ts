import { searchBooksCatalog } from '../../src/lib/bookCatalogServer'
import { bookApiCorsHeaders, rejectOrigin } from './_cors'

export const runtime = 'edge'

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')
  const ch = bookApiCorsHeaders(origin)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  if (rejectOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return new Response(JSON.stringify({ hits: [] }), {
      status: 200,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  try {
    const kakaoKey =
      process.env.KAKAO_REST_API_KEY ??
      process.env.VITE_KAKAO_REST_API_KEY ??
      null
    const hits = await searchBooksCatalog(q, kakaoKey)
    return new Response(JSON.stringify({ hits }), {
      status: 200,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message =
      e instanceof Error ? e.message : '도서 검색에 실패했습니다.'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }
}
