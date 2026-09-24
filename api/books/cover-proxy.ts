import { bookApiCorsHeaders, rejectOrigin } from './_cors'

export const config = { runtime: 'edge' }

const GOODS_RE = /^\d{4,12}$/

function yes24CoverThumbUrl(goodsNo: string, size: 'S' | 'M') {
  return `https://image.yes24.com/goods/${goodsNo}/${size}`
}

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

  const goodsNo =
    new URL(request.url).searchParams.get('goodsNo')?.trim() ?? ''
  if (!GOODS_RE.test(goodsNo)) {
    return new Response(JSON.stringify({ error: 'goodsNo가 필요합니다.' }), {
      status: 400,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.yes24.com/',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }

  try {
    let upstream = await fetch(yes24CoverThumbUrl(goodsNo, 'S'), { headers })
    if (!upstream.ok) {
      upstream = await fetch(yes24CoverThumbUrl(goodsNo, 'M'), { headers })
    }
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: '표지를 불러오지 못했습니다.' }), {
        status: 502,
        headers: { ...ch, 'Content-Type': 'application/json' },
      })
    }

    const type = upstream.headers.get('content-type') ?? 'image/jpeg'
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...ch,
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e) {
    const message =
      e instanceof Error ? e.message : '표지를 불러오지 못했습니다.'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }
}
