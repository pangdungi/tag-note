import { fetchYes24BookPhysicalSize } from '../../src/lib/bookCatalogServer'
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
  const goodsNo = url.searchParams.get('goodsNo')?.trim() ?? ''
  const isbn = url.searchParams.get('isbn')?.trim() ?? ''
  if (!goodsNo && !isbn) {
    return new Response(JSON.stringify({ size: null }), {
      status: 200,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  try {
    const size = await fetchYes24BookPhysicalSize({ goodsNo, isbn })
    return new Response(JSON.stringify({ size }), {
      status: 200,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message =
      e instanceof Error ? e.message : '책 크기를 불러오지 못했습니다.'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }
}
