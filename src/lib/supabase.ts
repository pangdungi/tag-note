import { createClient } from '@supabase/supabase-js'

const rawFetch: typeof fetch =
  globalThis.fetch?.bind(globalThis) ?? fetch

/** recover 무응답 시 UI·디버깅용 (네트워크 이슈 때). */
const AUTH_RECOVER_FETCH_TIMEOUT_MS = 25_000

function authEnvHint(): Record<string, unknown> {
  return {
    onLine: typeof navigator !== 'undefined' ? navigator.onLine : '(n/a)',
    connection:
      typeof navigator !== 'undefined' &&
      'connection' in navigator &&
      navigator.connection &&
      typeof (navigator.connection as NetworkInformation).effectiveType ===
        'string'
        ? (navigator.connection as NetworkInformation).effectiveType
        : '(n/a)',
    origin:
      typeof window !== 'undefined' ? window.location.origin : '(no-window)',
  }
}

/** recover POST에만: 항상 수동 타임아웃(SDK signal만 쓰면 타임아웃이 무시되는 브라우저가 있음). */
function wrapRecoverPostWithTimeout(
  pathOnly: string,
  method: string,
  init: RequestInit | undefined,
  reqId: string,
  requestHost: string,
): { nextInit: RequestInit | undefined; clearTimer: () => void } {
  const isRecoverPost =
    method === 'POST' &&
    (pathOnly.includes('/recover') || pathOnly.includes('/auth/v1/recover'))

  if (!isRecoverPost) {
    return {
      nextInit: init,
      clearTimer: () => {},
    }
  }

  const timeoutAc = new AbortController()
  const timer = window.setTimeout(() => {
    console.error(
      [
        '[tag-note][auth 진단] === 비밀번호 재설정(recover) 요청이 끝나지 않음 ===',
        `원인 후보: 브라우저에서 Supabase 인증 서버(${requestHost})로 가는 HTTPS 요청이 응답 없이 멈춘 상태입니다.`,
        '이건 앱 화면(로컬호스트) 문제가 아니라, 아래 중 하나인 경우가 많습니다.',
        '  · PC/회사 VPN·방화벽·백신·웹 필터가 supabase.co 트래픽을 막거나 지연',
        '  · DNS/IPv6 문제로 특정 환경에서만 연결이 안 됨',
        '  · 일시적 지역/구간 네트워크 장애',
        '확인 방법: 개발자도구 Network 탭에서 이 POST가 (pending)으로만 남는지, 스마트폰 LTE 등 다른 망에서 같은 시도.',
        `요청 reqId: ${reqId} · 타임아웃 ${AUTH_RECOVER_FETCH_TIMEOUT_MS / 1000}s 후 강제 중단`,
      ].join('\n'),
    )
    timeoutAc.abort()
  }, AUTH_RECOVER_FETCH_TIMEOUT_MS)

  const clearTimer = () => window.clearTimeout(timer)

  const existing = init?.signal
  let signal: AbortSignal = timeoutAc.signal
  let mergeMode: 'timeoutOnly' | 'abortSignalAny' = 'timeoutOnly'

  if (
    existing &&
    typeof AbortSignal !== 'undefined' &&
    'any' in AbortSignal &&
    typeof AbortSignal.any === 'function'
  ) {
    signal = AbortSignal.any([existing, timeoutAc.signal])
    mergeMode = 'abortSignalAny'
  } else if (existing) {
    console.warn(
      '[tag-note][auth 진단] AbortSignal.any 미지원 브라우저입니다. recover에는 타임아웃 abort만 적용합니다.',
      { reqId },
    )
  }

  const nextInit = init ? { ...init, signal } : { signal }

  console.info('[tag-note][auth-fetch] recover 타임아웃·signal 병합', {
    reqId,
    mergeMode,
    timeoutMs: AUTH_RECOVER_FETCH_TIMEOUT_MS,
    targetHost: requestHost,
    ...authEnvHint(),
  })

  return { nextInit, clearTimer }
}

function explainRecoverHttpStatus(status: number, bodySnippet: string): string {
  const low = bodySnippet.toLowerCase()
  if (status === 429) {
    return '429 · 이메일 발송/인증 요청 한도 초과. Supabase 대시보드 Rate limits·이메일 정책을 확인하세요.'
  }
  if (status === 401 || status === 403) {
    return '401/403 · anon 키·프로젝트 URL 불일치 또는 권한 문제. .env의 URL/키가 이 프로젝트와 짝인지 확인하세요.'
  }
  if (status === 400 || status === 422) {
    if (low.includes('redirect') || low.includes('redirect_uri')) {
      return '400/422 · redirect_to가 허용 목록에 없을 수 있습니다. Supabase → Authentication → URL Configuration → Redirect URLs에 `/auth/recovery` 전체 URL을 넣으세요.'
    }
    return '400/422 · 요청 본문/redirect 등이 서버 검증에 실패했습니다. 응답 본문 앞부분을 참고하세요.'
  }
  if (status >= 500) {
    return `${status} · Supabase 쪽 일시 오류일 수 있습니다. 잠시 후 재시도하세요.`
  }
  return `${status} · 실패 응답입니다. 본문 앞부분을 참고하세요.`
}

function diagnoseAuthFetchRejection(
  err: unknown,
  reqId: string,
  pathOnly: string,
): void {
  const name = err instanceof Error ? err.name : ''
  const raw = err instanceof Error ? err.message : String(err)
  const msg = raw.toLowerCase()

  if (name === 'AbortError' || msg.includes('abort')) {
    if (pathOnly.includes('recover')) {
      console.error(
        '[tag-note][auth 진단] fetch가 Abort(중단)되었습니다. recover의 경우 **바로 위에 출력된 “응답이 끝나지 않음” 타임아웃 메시지**가 원인일 때가 많습니다.',
        { reqId, errorName: name },
      )
    } else {
      console.error(
        '[tag-note][auth 진단] 요청이 중단(abort)되었습니다.',
        { reqId, errorName: name },
      )
    }
    return
  }

  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed')
  ) {
    console.error(
      '[tag-note][auth 진단] 브라우저가 네트워크 연결을 완료하지 못했습니다(failed to fetch). 오프라인·방화벽·프록시·DNS를 의심하세요.',
      { reqId, ...authEnvHint() },
    )
    return
  }

  console.error('[tag-note][auth 진단] fetch 예외(위 메시지 참고)', {
    reqId,
    name,
    message: raw,
  })
}

/** Supabase Auth 요청 추적 + 실패 시 한국어 원인 안내. */
function tagNoteDebugFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const href =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

  let requestHost = '(parse-fail)'
  let pathOnly = ''
  try {
    const u = new URL(href)
    requestHost = u.host
    pathOnly = u.pathname + u.search
  } catch {
    pathOnly = href.slice(0, 120)
  }

  const isAuth =
    pathOnly.includes('/auth/v1/') || pathOnly.includes('/auth/v')
  const reqId = Math.random().toString(36).slice(2, 10)
  const method = (init?.method ?? 'GET').toUpperCase()

  const { nextInit, clearTimer } = wrapRecoverPostWithTimeout(
    pathOnly,
    method,
    init,
    reqId,
    requestHost,
  )

  if (isAuth) {
    console.info('[tag-note][auth-fetch] 요청', {
      reqId,
      method,
      host: requestHost,
      path: pathOnly.slice(0, 180),
      recoverTimeoutMs: pathOnly.includes('/recover')
        ? AUTH_RECOVER_FETCH_TIMEOUT_MS
        : undefined,
      ...authEnvHint(),
    })
  }

  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  const p = rawFetch(input, nextInit)

  return p
    .finally(() => {
      clearTimer()
    })
    .then(async (res) => {
      if (isAuth) {
        const ms =
          typeof performance !== 'undefined' ? performance.now() - t0 : 0
        console.info('[tag-note][auth-fetch] 응답(HTTP 완료)', {
          reqId,
          status: res.status,
          ok: res.ok,
          ms: Math.round(ms),
        })

        if (!res.ok && pathOnly.includes('/recover')) {
          let bodySnippet = ''
          try {
            bodySnippet = (await res.clone().text()).slice(0, 400)
          } catch {
            bodySnippet = '(본문 읽기 실패)'
          }
          console.error(
            '[tag-note][auth 진단] recover 요청은 도달했으나 서버가 실패 응답을 돌려줬습니다.',
            {
              reqId,
              status: res.status,
              원인요약: explainRecoverHttpStatus(res.status, bodySnippet),
              body앞부분: bodySnippet,
            },
          )
        }
      }
      return res
    })
    .catch((err: unknown) => {
      if (isAuth) {
        diagnoseAuthFetchRejection(err, reqId, pathOnly)
      }
      throw err
    })
}

/** .env 미설정 시에도 앱이 로드되도록 하는 더미 값(API 호출은 실패함). */
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'

const url = import.meta.env.VITE_SUPABASE_URL || PLACEHOLDER_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PLACEHOLDER_ANON

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() &&
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
)

/** 배포 시 키가 잘리면 Invalid API key가 납니다. JWT anon 키는 보통 eyJ로 시작하고 길이가 깁니다. */
export function isSupabaseAnonKeyPlausible(): boolean {
  const raw = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!raw) return false
  return raw.startsWith('eyJ') && raw.length >= 120
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: tagNoteDebugFetch },
})

/** PostgREST 베이스 (`…/rest/v1` 앞까지, 끝 슬래시 없음) */
export const supabaseUrlForRest = url.replace(/\/$/, '')

/** anon 키 — 브라우저에서 직접 `fetch`할 때만 사용 (클라이언트 번들에 포함됨) */
export const supabaseAnonKey = anonKey

/**
 * recover POST가 무응답일 때: 같은 호스트로 짧은 Auth GET을 보내
 * 「호스트 전체 차단」vs「recover 경로만 이상」을 가늠합니다.
 * rawFetch 사용(tagNoteDebugFetch 미경유).
 */
export async function logSupabaseAuthReachabilityProbe(
  context: string,
): Promise<void> {
  if (!isSupabaseConfigured || url.includes('placeholder.supabase.co')) {
    console.info('[tag-note][auth 진단] 연결 프로브 생략(미설정/placeholder)', {
      context,
    })
    return
  }

  const base = url.replace(/\/$/, '')
  const probeUrl = `${base}/auth/v1/user`
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const useNativeTimeout =
    typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.timeout === 'function'

  const signal: AbortSignal = useNativeTimeout
    ? AbortSignal.timeout(8000)
    : (() => {
        const ac = new AbortController()
        timer = window.setTimeout(() => ac.abort(), 8000)
        return ac.signal
      })()

  try {
    const r = await rawFetch(probeUrl, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal,
    })

    const ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0

    const 빠른응답 = ms < 12000
    const 상태로그인없음 = r.status === 401 || r.status === 403

    let 해석: string
    if (빠른응답 && 상태로그인없음) {
      해석 =
        '같은 Supabase 프로젝트(호스트)와 HTTP 왕복은 됩니다. recover POST만 영원히 pending 이면 — (1) 이 PC/망의 프록시가 POST만 지연 (2) Supabase recover/WAF 이슈(드묾) (3) 확장 프로그램이 POST만 건드림 — 을 의심하세요. 터미널 curl로 동일 POST를 비교하세요.'
    } else if (빠른응답) {
      해석 = `예상 밖 status ${r.status}. 그래도 응답 시간이 ${Math.round(ms)}ms로 짧다면 망은 살아 있는 편입니다.`
    } else {
      해석 = '응답이 느리거나 비정상입니다.'
    }

    console.info('[tag-note][auth 진단] === 연결 프로브(끝) ===', {
      context,
      요청: 'GET /auth/v1/user (비로그인·anon 헤더만)',
      ms: Math.round(ms),
      httpStatus: r.status,
      해석,
      curl힌트: `터미널에서 동일 recover를 직접 쳐 보세요(anon은 .env 값): curl -sS -m 20 -X POST '${base}/auth/v1/recover?redirect_to=ENCODED' -H 'apikey: ANON' -H 'Authorization: Bearer ANON' -H 'Content-Type: application/json' -d '{"email":"본인이메일"}'`,
    })
  } catch (e) {
    const ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0
    console.error('[tag-note][auth 진단] === 연결 프로브(실패) ===', {
      context,
      요청: 'GET /auth/v1/user',
      ms: Math.round(ms),
      err: e,
      해석:
        '프로브조차 실패·타임아웃이면 recover만의 문제가 아니라, 이 브라우저·망에서 해당 Supabase 호스트 접근 자체가 막히거나 극도로 지연되는 쪽이 유력합니다.',
    })
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

interface NetworkInformation {
  effectiveType?: string
}
