import {
  supabase,
  supabaseAnonKey,
  supabaseProjectHost,
  supabaseUrlForRest,
} from './supabase'
import type { UserSubscriptionRow } from './subscription'

const LOG = '[태그노트/subscription]'

function ts(): { iso: string; perf?: number } {
  return {
    iso: new Date().toISOString(),
    perf:
      typeof performance !== 'undefined' ? performance.now() : undefined,
  }
}

/** `maybeSingle()`이 영구 pending일 때 */
export class SubscriptionFetchTimeoutError extends Error {
  override name = 'SubscriptionFetchTimeoutError'
  constructor(ms: number) {
    super(
      `user_subscriptions 조회가 ${ms}ms 안에 끝나지 않았습니다. 네트워크 또는 Supabase 응답을 확인하세요.`,
    )
  }
}

const FETCH_TIMEOUT_MS = 18_000
const BROWSER_FETCH_TIMEOUT_MS = 15_000

function navHint(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return {}
  const c = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number }
    }
  ).connection
  return {
    onLine: navigator.onLine,
    visibility: typeof document !== 'undefined' ? document.visibilityState : null,
    connectionEffectiveType: c?.effectiveType ?? null,
  }
}

function startHeartbeat(
  label: string,
  reqId: string,
  intervalMs: number,
): () => void {
  let n = 0
  const id = window.setInterval(() => {
    n += 1
    if (n > 300) return
    console.warn(LOG, `⏳ ${label} (아직 끝 안 남)`, {
      reqId,
      경과구간: `${n * (intervalMs / 1000)}초`,
      ...ts(),
      ...navHint(),
    })
  }, intervalMs)
  return () => window.clearInterval(id)
}

/**
 * 브라우저 fetch. `accessToken` 있으면 getSession 생략(SIGNED_IN 중첩 getSession 데드락 방지).
 */
async function fetchUserSubscriptionViaBrowserFetch(
  userId: string,
  parentCallId?: string,
  accessTokenFromCaller?: string | null,
): Promise<UserSubscriptionRow | null> {
  const reqId = `${parentCallId ?? 'solo'}:${Math.random().toString(36).slice(2, 8)}`
  const shortId = `${userId.slice(0, 8)}…`
  const isPlaceholder =
    !supabaseUrlForRest || supabaseUrlForRest.includes('placeholder.supabase.co')

  console.log(LOG, '┏━━ [경로A:브라우저fetch] 시작 ━━', {
    reqId,
    callId: parentCallId,
    userId: shortId,
    restHost: supabaseProjectHost,
    placeholderUrl: isPlaceholder,
    jwt전달받음: Boolean(accessTokenFromCaller?.length),
    ...ts(),
    ...navHint(),
  })

  console.log(LOG, '[경로A][0] placeholder 통과 직전', { reqId, isPlaceholder })
  if (isPlaceholder) {
    console.warn(LOG, '[경로A][0]→중단 placeholder URL', { reqId })
    throw new Error('placeholder-url')
  }

  let token: string
  let jwt출처: 'caller.access_token' | 'supabase.auth.getSession'

  if (accessTokenFromCaller && accessTokenFromCaller.length > 0) {
    jwt출처 = 'caller.access_token'
    token = accessTokenFromCaller
    console.log(LOG, '[경로A][1] JWT 확보 — 호출자 session.access_token (getSession 생략)', {
      reqId,
      jwt출처,
      token길이: token.length,
      ...ts(),
    })
  } else {
    jwt출처 = 'supabase.auth.getSession'
    console.log(LOG, '[경로A][1] JWT 없음 → supabase.auth.getSession() 사용', {
      reqId,
      주의:
        'SIGNED_IN 직후면 getSession이 여기서 멈출 수 있음. AuthProvider에서 access_token 넘기는지 확인.',
      ...ts(),
    })
    console.log(LOG, '[경로A][1a] getSession await 직전', { reqId, ...ts() })
    const stopHb = startHeartbeat('getSession 대기', reqId, 1000)
    const tSess =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    try {
      const { data: sessPack, error: sessErr } = await supabase.auth.getSession()
      const sessMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        tSess
      console.log(LOG, '[경로A][1b] getSession await 반환', {
        reqId,
        ms: Math.round(sessMs),
        session있음: Boolean(sessPack.session?.access_token),
        getSession에러: sessErr?.message ?? null,
        ...ts(),
      })
      if (sessErr) {
        console.error(LOG, '[경로A][1b] getSession 에러 객체', { reqId, sessErr })
      }
      const t = sessPack.session?.access_token
      if (!t) {
        console.warn(LOG, '[경로A][1c] 중단 — 응답에 access_token 없음', { reqId })
        throw new Error('no-access-token')
      }
      token = t
    } finally {
      stopHb()
      console.log(LOG, '[경로A][1z] getSession 구간 하트비트 정리', { reqId })
    }
  }

  console.log(LOG, '[경로A][2] JWT 확정', {
    reqId,
    jwt출처,
    token길이: token.length,
    ...ts(),
  })

  const sel =
    'user_id,email,subscription_status,period_start,period_end'
  const href = `${supabaseUrlForRest}/rest/v1/user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=${encodeURIComponent(sel)}`

  console.log(LOG, '[경로A][3] fetch() await 직전', {
    reqId,
    method: 'GET',
    path: '/rest/v1/user_subscriptions',
    host: supabaseProjectHost,
    abortMs: BROWSER_FETCH_TIMEOUT_MS,
    url길이: href.length,
    ...ts(),
  })

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let res: Response
  const stopFetchHb = startHeartbeat('REST fetch 대기', reqId, 1000)
  try {
    let signal: AbortSignal | undefined
    if (
      typeof AbortSignal !== 'undefined' &&
      typeof AbortSignal.timeout === 'function'
    ) {
      signal = AbortSignal.timeout(BROWSER_FETCH_TIMEOUT_MS)
    } else {
      const ac = new AbortController()
      window.setTimeout(() => ac.abort(), BROWSER_FETCH_TIMEOUT_MS)
      signal = ac.signal
    }
    res = await fetch(href, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal,
    })
  } catch (e) {
    const ms =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    console.error(LOG, '[경로A][3x] fetch 예외', {
      reqId,
      ms: Math.round(ms),
      name: e instanceof Error ? e.name : typeof e,
      message: e instanceof Error ? e.message : String(e),
      ...ts(),
      ...navHint(),
    })
    throw e
  } finally {
    stopFetchHb()
    console.log(LOG, '[경로A][3z] fetch 구간 하트비트 정리', { reqId })
  }

  const msFetch =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  console.log(LOG, '[경로A][4] fetch 반환 — res.text() await 직전', {
    reqId,
    fetchMs: Math.round(msFetch),
    status: res.status,
    ...ts(),
  })

  const stopTextHb = startHeartbeat('res.text() 대기', reqId, 1000)
  let bodyText: string
  try {
    bodyText = await res.text()
  } finally {
    stopTextHb()
  }

  console.log(LOG, '[경로A][5] HTTP 본문 수신', {
    reqId,
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    contentType: res.headers.get('content-type') ?? '',
    body바이트대략: bodyText.length,
    body앞200자: bodyText.slice(0, 200).replace(/\s+/g, ' '),
    ...ts(),
  })

  if (res.status === 404) {
    console.error(LOG, '[경로A][5x] 404', { reqId })
    return null
  }

  if (!res.ok) {
    console.error(LOG, '[경로A][5x] 비정상 HTTP', { reqId, status: res.status })
    return null
  }

  let rows: unknown
  try {
    rows = JSON.parse(bodyText) as unknown
  } catch (e) {
    console.error(LOG, '[경로A][5x] JSON 파싱 실패', { reqId, e })
    return null
  }

  if (!Array.isArray(rows)) {
    console.error(LOG, '[경로A][5x] JSON이 배열 아님', { reqId })
    return null
  }

  if (rows.length === 0) {
    console.warn(LOG, '[경로A][6] 빈 배열 (행 없음 또는 RLS)', { reqId })
    return null
  }

  const row = rows[0] as UserSubscriptionRow
  console.log(LOG, '┗━━ [경로A:브라우저fetch] 성공 ━━', {
    reqId,
    subscription_status: row.subscription_status,
    period_start: row.period_start,
    period_end: row.period_end,
    ...ts(),
  })
  return row
}

async function fetchUserSubscriptionViaSupabaseJs(
  userId: string,
  hbRef: { id?: ReturnType<typeof setInterval> },
  parentCallId?: string,
): Promise<UserSubscriptionRow | null> {
  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  const shortId = `${userId.slice(0, 8)}…`
  const reqId = `${parentCallId ?? 'solo'}:${Math.random().toString(36).slice(2, 8)}`
  console.log(LOG, '[경로B:supabase-js] 요청 시작', {
    reqId,
    callId: parentCallId,
    userId: shortId,
    restHost: supabaseProjectHost,
    ...ts(),
  })

  let heartbeat = 0
  hbRef.id = window.setInterval(() => {
    heartbeat += 1
    if (heartbeat > 120) return
    console.warn(LOG, '[경로B:supabase-js] ⏳ maybeSingle 대기', {
      reqId,
      callId: parentCallId,
      약N초경과: heartbeat * 2,
      ...ts(),
    })
  }, 2000)

  try {
    console.log(LOG, '[경로B][1] maybeSingle await 직전', { reqId, ...ts() })
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('user_id, email, subscription_status, period_start, period_end')
      .eq('user_id', userId)
      .maybeSingle()

    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    console.log(LOG, '[경로B][2] maybeSingle 반환', {
      reqId,
      ms: Math.round(elapsed),
      error있음: Boolean(error),
      data있음: Boolean(data),
      ...ts(),
    })

    if (error) {
      console.error(LOG, '[경로B] PostgREST 에러', {
        reqId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      return null
    }
    if (!data) {
      console.warn(LOG, '[경로B] 행 없음', { reqId })
      return null
    }
    return data as UserSubscriptionRow
  } catch (e) {
    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    console.error(LOG, '[경로B] 예외', {
      reqId,
      ms: Math.round(elapsed),
      e,
      ...ts(),
    })
    throw e
  } finally {
    if (hbRef.id !== undefined) {
      window.clearInterval(hbRef.id)
      hbRef.id = undefined
    }
    console.log(LOG, '[경로B] finally — 하트비트 정리', { reqId })
  }
}

/**
 * @param accessTokenFromCaller - 있으면 경로A에서 getSession 호출 안 함(중요).
 */
export async function fetchUserSubscription(
  userId: string,
  accessTokenFromCaller?: string | null,
): Promise<UserSubscriptionRow | null> {
  const callId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  console.log(LOG, '━━━━━━━━ fetchUserSubscription 진입 ━━━━━━━━', {
    callId,
    userId: `${userId.slice(0, 8)}…`,
    restHost: supabaseProjectHost,
    accessToken전달: Boolean(accessTokenFromCaller?.length),
    ...ts(),
    ...navHint(),
  })

  try {
    const row = await fetchUserSubscriptionViaBrowserFetch(
      userId,
      callId,
      accessTokenFromCaller,
    )
    console.log(LOG, '[요약] 경로A 완료', {
      callId,
      row있음: Boolean(row),
      ...ts(),
    })
    return row
  } catch (aErr) {
    console.warn(LOG, '[요약] 경로A 실패 → 경로B 폴백', {
      callId,
      이유: aErr instanceof Error ? aErr.message : String(aErr),
      ...ts(),
    })
  }

  const hbRef: { id?: ReturnType<typeof setInterval> } = {}
  let outerTimer: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    outerTimer = window.setTimeout(() => {
      if (hbRef.id !== undefined) {
        window.clearInterval(hbRef.id)
        hbRef.id = undefined
        console.warn(LOG, '[경로B] 전역 타임아웃', {
          callId,
          ms: FETCH_TIMEOUT_MS,
          ...ts(),
        })
      }
      reject(new SubscriptionFetchTimeoutError(FETCH_TIMEOUT_MS))
    }, FETCH_TIMEOUT_MS)
  })

  try {
    const row = await Promise.race([
      fetchUserSubscriptionViaSupabaseJs(userId, hbRef, callId),
      timeoutPromise,
    ])
    console.log(LOG, '[요약] 경로B 완료', {
      callId,
      row있음: Boolean(row),
      ...ts(),
    })
    return row
  } finally {
    if (outerTimer !== undefined) window.clearTimeout(outerTimer)
  }
}
