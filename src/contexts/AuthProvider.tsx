import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  supabase,
  isSupabaseConfigured,
  logSupabaseAuthReachabilityProbe,
} from '../lib/supabase'
import {
  AUTH_NOTICE_KEY,
  canAccessWithSubscription,
  isSubscriptionGateActive,
  type UserSubscriptionRow,
} from '../lib/subscription'
import {
  fetchUserSubscription,
  SubscriptionFetchTimeoutError,
} from '../lib/subscriptionsApi'
import { loadAndApplyUserAppFontSafe } from '../lib/userPreferencesApi'
import { resetAppFontForSignedOut } from '../lib/appFont'
import { clearHomeSnapshotCache } from '../lib/homeSnapshotCache'
import { AuthContext } from './auth-context'

function isLocalAppHostname(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

function setExpiryNoticeAndSignOut(): void {
  sessionStorage.setItem(
    AUTH_NOTICE_KEY,
    '체험·구독 기간이 만료되어 로그인할 수 없습니다.',
  )
}

function setMissingSubscriptionNotice(): void {
  sessionStorage.setItem(
    AUTH_NOTICE_KEY,
    '구독 정보가 없어 로그인할 수 없습니다. 관리자에게 문의하세요.',
  )
}

/** 이 이벤트는 조용히 processSession만 하면 되고, 앱 전체「불러오는 중」오버레이를 켜지 않는다. */
function isAuthEventSilentForGlobalLoading(event: string): boolean {
  return (
    event === 'TOKEN_REFRESHED' ||
    event === 'USER_UPDATED' ||
    event === 'PASSWORD_RECOVERY' ||
    event === 'MFA_CHALLENGE_VERIFIED'
  )
}

/** 탭 전환·토큰 갱신 등 — 사용자 id가 같으면 화면을 비우지 않는다. */
function shouldShowGlobalAuthLoading(
  event: string,
  prevUserId: string | null,
  nextUserId: string | null,
): boolean {
  if (event === 'INITIAL_SESSION') return false
  if (isAuthEventSilentForGlobalLoading(event)) return false
  if (prevUserId && nextUserId === prevUserId) return false
  if (!prevUserId && nextUserId) return true
  if (prevUserId && !nextUserId) return true
  if (prevUserId && nextUserId && prevUserId !== nextUserId) return true
  return false
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [subscription, setSubscription] = useState<UserSubscriptionRow | null>(
    null,
  )
  const [loading, setLoading] = useState(true)

  const processInFlightRef = useRef(0)
  const sessionRef = useRef<Session | null>(null)

  useLayoutEffect(() => {
    sessionRef.current = session
  }, [session])

  const processSession = useCallback(async (next: Session | null) => {
    processInFlightRef.current += 1
    const flight = processInFlightRef.current
    console.info('[tag-note][auth] processSession 시작', {
      flight,
      hasUser: Boolean(next?.user),
      path:
        typeof window !== 'undefined' ? window.location.pathname : '(no-window)',
    })

    try {
      if (!next?.user) {
        setSubscription(null)
        setSession(null)
        clearHomeSnapshotCache()
        resetAppFontForSignedOut()
        return
      }

      const recoveryPath =
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/auth/recovery')

      if (recoveryPath) {
        setSubscription(null)
        setSession(next)
        return
      }

      if (!isSupabaseConfigured) {
        setSubscription(null)
        setSession(next)
        return
      }

      let sub: UserSubscriptionRow | null
      try {
        sub = await fetchUserSubscription(next.user.id, next.access_token)
      } catch (e) {
        if (e instanceof SubscriptionFetchTimeoutError) {
          setSubscription(null)
          setSession(next)
          void loadAndApplyUserAppFontSafe(next.user.id)
          return
        }
        throw e
      }

      if (
        isSubscriptionGateActive() &&
        (!sub || !canAccessWithSubscription(sub))
      ) {
        await supabase.auth.signOut()
        clearHomeSnapshotCache(next.user.id)
        if (!sub) {
          setMissingSubscriptionNotice()
        } else {
          setExpiryNoticeAndSignOut()
        }
        setSubscription(null)
        setSession(null)
        resetAppFontForSignedOut()
        return
      }

      setSubscription(sub)
      setSession(next)
      void loadAndApplyUserAppFontSafe(next.user.id)
    } finally {
      processInFlightRef.current = Math.max(0, processInFlightRef.current - 1)
      console.info('[tag-note][auth] processSession 끝', {
        flight,
        remaining: processInFlightRef.current,
      })
    }
  }, [])

  const processSessionRef = useRef(processSession)
  useLayoutEffect(() => {
    processSessionRef.current = processSession
  }, [processSession])

  useEffect(() => {
    let alive = true

    void (async () => {
      try {
        console.info('[tag-note][auth] bootstrap: getSession 호출')
        const { data } = await supabase.auth.getSession()
        console.info('[tag-note][auth] bootstrap: getSession 완료', {
          hasSession: Boolean(data.session?.user),
        })
        if (!alive) {
          return
        }
        /* getSession 직후 같은 스택에서 processSession을 await 하면 recover 등과 잠금 충돌 가능 */
        window.setTimeout(() => {
          if (!alive) return
          void (async () => {
            try {
              console.info('[tag-note][auth] bootstrap: processSession(지연) 시작')
              await processSessionRef.current(data.session ?? null)
              console.info('[tag-note][auth] bootstrap: processSession(지연) 끝')
            } finally {
              if (alive) setLoading(false)
            }
          })()
        }, 0)
      } catch (e) {
        console.warn('[tag-note][auth] bootstrap 실패', e)
        if (alive) setLoading(false)
      }
    })()

    const {
      data: { subscription: listener },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) {
        return
      }
      console.info('[tag-note][auth] onAuthStateChange', {
        event,
        path:
          typeof window !== 'undefined' ? window.location.pathname : '(no-window)',
        hasSession: Boolean(nextSession?.user),
      })
      if (event === 'INITIAL_SESSION') {
        return
      }

      /* GoTrue는 이 콜백이 끝날 때까지 잠금을 잡는 경우가 있어, 여기서 await 하면
       * resetPasswordForEmail 등 다른 auth API가 영구 대기할 수 있음 → 비동기 작업은 다음 틱으로. */
      window.setTimeout(() => {
        if (!alive) {
          return
        }
        console.info('[tag-note][auth] onAuthStateChange: setTimeout(0) 콜백 실행', {
          event,
        })
        const prevUserId = sessionRef.current?.user?.id ?? null
        const nextUserId = nextSession?.user?.id ?? null
        if (prevUserId && nextUserId === prevUserId) {
          if (nextSession) {
            setSession(nextSession)
          }
          console.info(
            '[tag-note][auth] onAuthStateChange: 동일 사용자 — 세션만 갱신, processSession 생략',
            { event },
          )
          return
        }
        void (async () => {
          const blockGlobalLoading = shouldShowGlobalAuthLoading(
            event,
            prevUserId,
            nextUserId,
          )
          if (blockGlobalLoading) {
            setLoading(true)
          }
          console.info('[tag-note][auth] onAuthStateChange processSession 시작', {
            event,
            blockGlobalLoading,
          })
          try {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 300)
            })
            await processSessionRef.current(nextSession)
            if (!alive) return
          } catch (e) {
            console.warn('[tag-note][auth] onAuthStateChange processSession 실패', {
              event,
              error: e,
            })
          } finally {
            if (alive && blockGlobalLoading) {
              setLoading(false)
              console.info('[tag-note][auth] onAuthStateChange 처리 끝', { event })
            } else if (alive) {
              console.info(
                '[tag-note][auth] onAuthStateChange 처리 끝(전역 로딩 없음)',
                { event },
              )
            }
          }
        })()
      }, 0)
    })

    return () => {
      alive = false
      listener.unsubscribe()
    }
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        console.warn('[tag-note][auth] signInWithPassword 실패', {
          message: error.message,
          status: (error as { status?: number }).status,
          hint:
            error.message.includes('API key') || error.message.includes('JWT')
              ? 'Vercel·.env의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 같은 Supabase 프로젝트 쌍인지 확인하세요. 비밀번호 오류와 무관합니다.'
              : undefined,
        })
        return { error: new Error(error.message) }
      }


      if (!isSupabaseConfigured) {
        setSubscription(null)
        setSession(data.session)
        return { error: null }
      }

      let sub: UserSubscriptionRow | null
      try {
        sub = await fetchUserSubscription(
          data.user.id,
          data.session?.access_token ?? null,
        )
      } catch (e) {
        if (e instanceof SubscriptionFetchTimeoutError) {
          setSubscription(null)
          setSession(data.session)
          void loadAndApplyUserAppFontSafe(data.user.id)
          return { error: null }
        }
        throw e
      }
      if (
        isSubscriptionGateActive() &&
        (!sub || !canAccessWithSubscription(sub))
      ) {
        await supabase.auth.signOut()
        clearHomeSnapshotCache(data.user.id)
        setSubscription(null)
        setSession(null)
        resetAppFontForSignedOut()
        if (!sub) {
          setMissingSubscriptionNotice()
          return {
            error: new Error(
              '구독 정보가 없어 로그인할 수 없습니다. 관리자에게 문의하세요.',
            ),
          }
        }
        setExpiryNoticeAndSignOut()
        return {
          error: new Error(
            '체험·구독 기간이 만료되어 로그인할 수 없습니다.',
          ),
        }
      }

      setSubscription(sub)
      setSession(data.session)
      void loadAndApplyUserAppFontSafe(data.user.id)
      return { error: null }
    },
    [],
  )

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      console.info('[tag-note][auth] requestPasswordReset: Supabase 미설정')
      return { error: new Error('Supabase가 설정되지 않았습니다.') }
    }
    const redirectTo = `${window.location.origin}/auth/recovery`

    const proxyExplicitOff =
      import.meta.env.VITE_AUTH_RECOVER_PROXY === 'false' ||
      import.meta.env.VITE_AUTH_RECOVER_PROXY === '0'
    const proxyExplicitOn =
      import.meta.env.VITE_AUTH_RECOVER_PROXY === 'true' ||
      import.meta.env.VITE_AUTH_RECOVER_PROXY === '1'

    const recoverProxyUrl =
      import.meta.env.VITE_AUTH_RECOVER_PROXY_URL?.trim() ||
      '/api/auth/recover-request'
    const relativeProxy = recoverProxyUrl.startsWith('/')

    const useRecoverProxy =
      !proxyExplicitOff &&
      (proxyExplicitOn ||
        (import.meta.env.PROD &&
          !(relativeProxy && isLocalAppHostname())))

    if (useRecoverProxy) {
      console.info(
        '[tag-note][auth] recover: 배포 API 프록시(브라우저 → 우리 도메인 → Supabase)',
        { recoverProxyUrl, redirectTo },
      )
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0
      try {
        const ac = new AbortController()
        const tid = window.setTimeout(() => ac.abort(), 30_000)
        const res = await fetch(recoverProxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, redirectTo }),
          signal: ac.signal,
        })
        window.clearTimeout(tid)
        const text = await res.text()
        const ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0
        console.info('[tag-note][auth] recover 프록시 HTTP 완료', {
          ms: Math.round(ms),
          status: res.status,
          body앞: text.slice(0, 200),
        })
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const j = JSON.parse(text) as {
              msg?: string
              error?: string
              error_description?: string
              message?: string
            }
            msg =
              j.msg || j.error_description || j.message || j.error || msg
          } catch {
            if (text.length) msg = text.slice(0, 240)
          }
          console.error('[tag-note][auth 진단] 프록시가 Supabase 오류 응답을 반환', {
            status: res.status,
            msg,
          })
          return { error: new Error(msg) }
        }
        console.info(
          '[tag-note][auth 진단] 프록시 경로로 recover가 끝났습니다. 메일·스팸함을 확인하세요.',
        )
        return { error: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[tag-note][auth 진단] recover 프록시 fetch 실패', { err: e })
        return { error: new Error(msg) }
      }
    }

    console.info('[tag-note][auth] requestPasswordReset: 브라우저→Supabase 직접(SDK)', {
      redirectTo,
      emailLen: email.length,
      processInFlight: processInFlightRef.current,
    })
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    let beat = 0
    const hb = window.setInterval(() => {
      beat += 1
      console.info('[tag-note][auth] resetPasswordForEmail 아직 대기 중', {
        beat,
        ms: Math.round(
          (typeof performance !== 'undefined' ? performance.now() : 0) - t0,
        ),
        processInFlight: processInFlightRef.current,
      })
    }, 1000)

    let resetError: { message: string } | null = null
    let resetData: unknown
    try {
      console.info('[tag-note][auth] requestPasswordReset: SDK 호출 직전 tick', {
        ts: Date.now(),
      })
      const r = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      resetError = r.error
      resetData = r.data
    } finally {
      window.clearInterval(hb)
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : 0
    console.info('[tag-note][auth] requestPasswordReset: SDK 반환', {
      ms: Math.round(t1 - t0),
      error: resetError?.message ?? null,
      data: resetData,
    })
    if (resetError?.message) {
      const m = resetError.message.toLowerCase()
      const isClientTimeoutAbort =
        m.includes('signal is aborted') ||
        m.includes('aborted without reason') ||
        m.includes('aborterror') ||
        (m.includes('abort') && m.includes('signal'))

      if (isClientTimeoutAbort) {
        console.warn(
          [
            '[tag-note][auth 진단] SDK 메시지「signal is aborted…」는 대부분 **서버가 거절한 게 아닙니다.**',
            'recover HTTP 요청에 응답이 오지 않아 앱이 약 25초 후 fetch를 끊었고, Supabase 클라이언트가 그걸 이렇게 돌려줍니다.',
            '→ 로컬에서만 그럴 때: 배포 사이트(https://www.tagtagnote.com)에서는 **프록시 API**로 같은 요청을 보냅니다.',
            '→ 또는 VITE_AUTH_RECOVER_PROXY=1 과 VITE_AUTH_RECOVER_PROXY_URL(프로덕션 /api 전체 URL)로 개발 서버에서도 프록시를 쓸 수 있습니다.',
            '→ 바로 이어서 같은 호스트로 연결 프로브를 보냅니다.',
          ].join('\n'),
          { sdkMessage: resetError.message },
        )
        await logSupabaseAuthReachabilityProbe(
          'recover POST 약 25초 무응답·SDK abort 직후',
        )
      } else {
        let 힌트 = '아래 message 원문과 대시보드 Auth 설정을 함께 보세요.'
        if (m.includes('rate') || m.includes('email')) {
          힌트 =
            '이메일/인증 요청 한도(레이트 리밋) 또는 이메일 설정 문제일 수 있습니다. 대시보드 Auth Rate limits·SMTP를 확인하세요.'
        }
        if (m.includes('redirect') || m.includes('validation')) {
          힌트 =
            'redirect_to URL이 Supabase Redirect URLs 허용 목록에 없을 수 있습니다.'
        }
        console.error(
          '[tag-note][auth 진단] recover 호출 후 Supabase가 실제 인증 오류를 반환했습니다.',
          { message: resetError.message, 힌트 },
        )
      }
    } else {
      console.info(
        '[tag-note][auth 진단] recover 요청이 SDK 기준으로 성공했습니다. 메일이 스팸함에 없는지 확인하세요.',
      )
    }
    return { error: resetError ? new Error(resetError.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    const uid = session?.user?.id
    await supabase.auth.signOut()
    if (uid) clearHomeSnapshotCache(uid)
    setSubscription(null)
    setSession(null)
    resetAppFontForSignedOut()
  }, [session])

  const refreshSubscription = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid || !isSupabaseConfigured) return
    let sub: UserSubscriptionRow | null
    try {
      sub = await fetchUserSubscription(uid, session?.access_token ?? null)
    } catch (e) {
      if (e instanceof SubscriptionFetchTimeoutError) {
        return
      }
      throw e
    }
    setSubscription(sub)
    if (
      isSubscriptionGateActive() &&
      (!sub || !canAccessWithSubscription(sub))
    ) {
      await supabase.auth.signOut()
      clearHomeSnapshotCache(uid)
      if (!sub) setMissingSubscriptionNotice()
      else setExpiryNoticeAndSignOut()
      setSubscription(null)
      setSession(null)
      resetAppFontForSignedOut()
    }
  }, [session])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      subscription,
      loading,
      signIn,
      signUp,
      requestPasswordReset,
      signOut,
      refreshSubscription,
    }),
    [
      session,
      subscription,
      loading,
      signIn,
      signUp,
      requestPasswordReset,
      signOut,
      refreshSubscription,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
