const ALLOWED_ORIGINS = new Set([
  'https://www.tagtagnote.com',
  'https://tagtagnote.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
])

export function bookApiCorsHeaders(
  requestOrigin: string | null,
): Record<string, string> {
  const allow =
    requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : 'https://www.tagtagnote.com'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

/** 같은 사이트 fetch는 Origin이 없을 수 있음 — 있을 때만 검사 */
export function rejectOrigin(requestOrigin: string | null): boolean {
  return Boolean(requestOrigin) && !ALLOWED_ORIGINS.has(requestOrigin)
}

export type BookApiReq = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
}

export type BookApiRes = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

export function readHeader(req: BookApiReq, name: string): string | null {
  const value = req.headers[name.toLowerCase()]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

export function sendBookApiJson(
  res: BookApiRes,
  status: number,
  body: unknown,
  headers: Record<string, string>,
) {
  res.statusCode = status
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}
