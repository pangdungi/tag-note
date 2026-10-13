import { AUTH_NOTICE_KEY, AUTH_SUCCESS_NOTICE_KEY } from './subscription'

/** 아임웹 앱 연동 — 서비스 URL(?siteCode=) → OAuth 시작 */
export function maybeRedirectImwebConnect(): boolean {
  if (typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  const siteCode = String(params.get('siteCode') || '').trim()
  if (!siteCode) return false

  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!base || !anon) return false

  const target =
    `${base}/functions/v1/imweb-connect?apikey=${encodeURIComponent(anon)}` +
    `&siteCode=${encodeURIComponent(siteCode)}`
  window.location.replace(target)
  return true
}

export function consumeImwebConnectResult(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const flag = String(url.searchParams.get('imweb') || '').trim()
  if (!flag) return

  const reason = String(url.searchParams.get('reason') || '').trim()
  try {
    if (flag === 'connected') {
      sessionStorage.setItem(
        AUTH_SUCCESS_NOTICE_KEY,
        '아임웹 연동이 완료되었습니다.',
      )
    } else if (flag === 'error') {
      sessionStorage.setItem(
        AUTH_NOTICE_KEY,
        reason
          ? `아임웹 연동에 실패했습니다. (${reason})`
          : '아임웹 연동에 실패했습니다.',
      )
    }
  } catch {
    /* ignore */
  }

  url.searchParams.delete('imweb')
  url.searchParams.delete('reason')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}
