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
