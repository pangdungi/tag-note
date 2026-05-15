/**
 * Vercel Serverless: 브라우저 → 우리 도메인 → 여기서 Supabase /auth/v1/recover POST 전달.
 * 일부 환경에서 브라우저→*.supabase.co 만 막히는 경우 우회용.
 *
 * 환경 변수: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (Vercel에 이미 있을 것)
 */

export const runtime = 'edge'

const ALLOWED_ORIGINS = new Set([
  'https://www.tagtagnote.com',
  'https://tagtagnote.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
])

function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const allow =
    requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : 'https://www.tagtagnote.com'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')
  const ch = corsHeaders(origin)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  let body: { email?: string; redirectTo?: string }
  try {
    body = (await request.json()) as { email?: string; redirectTo?: string }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const redirectTo =
    typeof body.redirectTo === 'string' ? body.redirectTo.trim() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  try {
    const rUrl = new URL(redirectTo)
    if (!ALLOWED_ORIGINS.has(rUrl.origin)) {
      return new Response(
        JSON.stringify({ error: 'redirectTo origin not allowed' }),
        {
          status: 400,
          headers: { ...ch, 'Content-Type': 'application/json' },
        },
      )
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid redirectTo' }), {
      status: 400,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anon) {
    console.error(
      '[api/auth/recover-request] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 없음',
    )
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...ch, 'Content-Type': 'application/json' },
    })
  }

  const recoverUrl = `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`

  const upstream = await fetch(recoverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({ email }),
  })

  const text = await upstream.text()
  const ct =
    upstream.headers.get('content-type') || 'application/json; charset=utf-8'

  return new Response(text, {
    status: upstream.status,
    headers: { ...ch, 'Content-Type': ct },
  })
}
