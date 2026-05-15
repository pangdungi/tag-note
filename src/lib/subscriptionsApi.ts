import {
  supabase,
  supabaseAnonKey,
  supabaseUrlForRest,
} from './supabase'
import type { UserSubscriptionRow } from './subscription'

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

/**
 * 브라우저 fetch. `accessToken` 있으면 getSession 생략(SIGNED_IN 중첩 getSession 데드락 방지).
 */
async function fetchUserSubscriptionViaBrowserFetch(
  userId: string,
  accessTokenFromCaller?: string | null,
): Promise<UserSubscriptionRow | null> {
  const isPlaceholder =
    !supabaseUrlForRest || supabaseUrlForRest.includes('placeholder.supabase.co')

  if (isPlaceholder) {
    throw new Error('placeholder-url')
  }

  let token: string

  if (accessTokenFromCaller && accessTokenFromCaller.length > 0) {
    token = accessTokenFromCaller
  } else {
    const { data: sessPack } = await supabase.auth.getSession()
    const t = sessPack.session?.access_token
    if (!t) {
      throw new Error('no-access-token')
    }
    token = t
  }

  const sel =
    'user_id,email,subscription_status,period_start,period_end'
  const href = `${supabaseUrlForRest}/rest/v1/user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=${encodeURIComponent(sel)}`

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
  const res = await fetch(href, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal,
  })

  const bodyText = await res.text()

  if (res.status === 404) {
    return null
  }

  if (!res.ok) {
    return null
  }

  let rows: unknown
  try {
    rows = JSON.parse(bodyText) as unknown
  } catch {
    return null
  }

  if (!Array.isArray(rows)) {
    return null
  }

  if (rows.length === 0) {
    return null
  }

  return rows[0] as UserSubscriptionRow
}

async function fetchUserSubscriptionViaSupabaseJs(
  userId: string,
): Promise<UserSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('user_id, email, subscription_status, period_start, period_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return null
  }
  if (!data) {
    return null
  }
  return data as UserSubscriptionRow
}

/**
 * @param accessTokenFromCaller - 있으면 경로A에서 getSession 호출 안 함(중요).
 */
export async function fetchUserSubscription(
  userId: string,
  accessTokenFromCaller?: string | null,
): Promise<UserSubscriptionRow | null> {
  try {
    const row = await fetchUserSubscriptionViaBrowserFetch(
      userId,
      accessTokenFromCaller,
    )
    return row
  } catch {
    /* 경로B 폴백 */
  }

  let outerTimer: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    outerTimer = window.setTimeout(() => {
      reject(new SubscriptionFetchTimeoutError(FETCH_TIMEOUT_MS))
    }, FETCH_TIMEOUT_MS)
  })

  try {
    return await Promise.race([
      fetchUserSubscriptionViaSupabaseJs(userId),
      timeoutPromise,
    ])
  } finally {
    if (outerTimer !== undefined) window.clearTimeout(outerTimer)
  }
}
