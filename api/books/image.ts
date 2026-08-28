import { fetchBookImageBytes, isAllowedBookImageUrl } from '../../src/lib/bookCatalogServer'
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
  const imageUrl = url.searchParams.get('url')?.trim() ?? ''
  if (!imageUrl || !isAllowedBookImageUrl(imageUrl)) {
    return new Response(JSON.stringify({ error: 'Invalid image url' }), {
      status: 400,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { bytes, contentType } = await fetchBookImageBytes(imageUrl)
    return new Response(bytes, {
      status: 200,
      headers: {
        ...ch,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e) {
    const message =
      e instanceof Error ? e.message : '이미지를 가져오지 못했습니다.'
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }
}
