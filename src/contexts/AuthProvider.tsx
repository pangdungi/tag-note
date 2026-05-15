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
  supabaseProjectHost,
} from '../lib/supabase'
import {
  AUTH_NOTICE_KEY,
  canAccessWithSubscription,
  isWithinSubscriptionPeriod,
  type UserSubscriptionRow,
} from '../lib/subscription'
import {
  fetchUserSubscription,
  SubscriptionFetchTimeoutError,
} from '../lib/subscriptionsApi'
import { AuthContext } from './auth-context'

const LOG = '[태그노트/auth]'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [subscription, setSubscription] = useState<UserSubscriptionRow | null>(
    null,
  )
  const [loading, setLoading] = useState(true)

  const processInFlightRef = useRef(0)

  /** 렌더마다 아님: 상태 묶음이 바뀔 때만 찍힘 */
  useEffect(() => {
    console.log(LOG, '📌 상태 스냅샷', {
      t: new Date().toISOString(),
      authLoading: loading,
      세션있음: Boolean(session?.user),
      userIdPrefix: session?.user?.id?.slice(0, 8) ?? null,
      구독행있음: Boolean(subscription),
      구독상태: subscription?.subscription_status,
      기간내: subscription
        ? isWithinSubscriptionPeriod(subscription, new Date())
        : null,
      supabaseHost: supabaseProjectHost,
      supabase설정됨: isSupabaseConfigured,
    })
  }, [loading, session, subscription, subscription?.period_end])

  const processSession = useCallback(async (next: Session | null) => {
    const trace = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const uid = next?.user?.id ?? null
    processInFlightRef.current += 1
    const depth = processInFlightRef.current
    console.log(LOG, 'processSession ▶ 시작', {
      trace,
      중첩깊이: depth,
      userIdPrefix: uid ? `${uid.slice(0, 8)}…` : null,
      supabase설정됨: isSupabaseConfigured,
    })

    try {
      if (!next?.user) {
        console.log(LOG, 'processSession 분기 ← 세션 없음', { trace })
        setSubscription(null)
        setSession(null)
        return
      }

      if (!isSupabaseConfigured) {
        console.log(LOG, 'processSession 분기 ← Supabase 미설정', { trace })
        setSubscription(null)
        setSession(next)
        return
      }

      console.log(LOG, 'processSession → fetchUserSubscription await 직전', {
        trace,
        userId: `${uid!.slice(0, 8)}…`,
        accessToken넘김: Boolean(next.access_token?.length),
      })
      let sub: UserSubscriptionRow | null
      try {
        sub = await fetchUserSubscription(next.user.id, next.access_token)
      } catch (e) {
        if (e instanceof SubscriptionFetchTimeoutError) {
          console.warn(
            LOG,
            'processSession 분기 ← 구독 조회 타임아웃, 세션 유지',
            { trace, message: (e as Error).message },
          )
          setSubscription(null)
          setSession(next)
          return
        }
        throw e
      }
      console.log(LOG, 'processSession → fetchUserSubscription await 직후', {
        trace,
        sub있음: Boolean(sub),
      })

      const allowed = Boolean(sub && canAccessWithSubscription(sub))
      const now = new Date()
      console.log(LOG, 'processSession → 구독 검사', {
        trace,
        구독행있음: Boolean(sub),
        기간내접근허용: allowed,
        status: sub?.subscription_status,
        ...(sub
          ? {
              period_start: sub.period_start,
              period_end: sub.period_end,
              기간내계산: isWithinSubscriptionPeriod(sub, now),
              nowISO: now.toISOString(),
            }
          : {}),
      })

      if (!sub || !canAccessWithSubscription(sub)) {
        console.log(LOG, 'processSession 분기 ← 구독 불가, signOut', {
          trace,
          sub있음: Boolean(sub),
          기간만료_또는없음: sub
            ? !isWithinSubscriptionPeriod(sub, new Date())
            : true,
        })
        console.log(LOG, 'processSession → supabase.auth.signOut await 직전', {
          trace,
        })
        await supabase.auth.signOut()
        console.log(LOG, 'processSession → supabase.auth.signOut await 직후', {
          trace,
        })
        if (!sub) {
          setMissingSubscriptionNotice()
        } else {
          setExpiryNoticeAndSignOut()
        }
        setSubscription(null)
        setSession(null)
        return
      }

      setSubscription(sub)
      setSession(next)
      console.log(LOG, 'processSession ■ 완료 (세션·구독 반영)', { trace })
    } catch (e) {
      console.error(LOG, 'processSession 예외', { trace, e })
      throw e
    } finally {
      processInFlightRef.current = Math.max(0, processInFlightRef.current - 1)
      console.log(LOG, 'processSession ▼ finally (퇴장)', {
        trace,
        남은중첩: processInFlightRef.current,
      })
    }
  }, [])

  const processSessionRef = useRef(processSession)
  useLayoutEffect(() => {
    processSessionRef.current = processSession
  }, [processSession])

  useEffect(() => {
    let alive = true
    const bootTrace = `boot-${Date.now().toString(36)}`

    void (async () => {
      const tBoot =
        typeof performance !== 'undefined' ? performance.now() : Date.now()
      console.log(LOG, '초기화[getSession]', '▶ 호출 직전', { bootTrace, tBoot })
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!alive) {
          console.log(LOG, '초기화[getSession]', '효과 정리됨 → 후속 생략', {
            bootTrace,
          })
          return
        }
        if (error) {
          console.error(LOG, '초기화[getSession]', '에러', { bootTrace, error })
        }
        console.log(LOG, '초기화[getSession]', '◀ 반환', {
          bootTrace,
          세션있음: Boolean(data.session?.user),
        })
        console.log(LOG, '초기화', 'processSession 호출 직전', { bootTrace })
        await processSessionRef.current(data.session ?? null)
        if (!alive) return
        const bootMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          tBoot
        console.log(LOG, '초기화', 'processSession 끝 → setLoading(false)', {
          bootTrace,
          부트스트랩전체ms: Math.round(bootMs),
        })
        setLoading(false)
      } catch (e) {
        console.error(LOG, '초기화 비동기 블록 예외', { bootTrace, e })
        if (alive) setLoading(false)
      } finally {
        console.log(LOG, '초기화 try/catch/finally 끝', { bootTrace, alive })
      }
    })()

    const {
      data: { subscription: listener },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!alive) {
        console.log(LOG, 'onAuthStateChange 무시 (효과 정리됨)', event)
        return
      }
      if (event === 'INITIAL_SESSION') {
        console.log(
          LOG,
          'onAuthStateChange INITIAL_SESSION 스킵 (상단 getSession이 처리)',
          {
            다음세션있음: Boolean(nextSession?.user),
          },
        )
        return
      }
      const evTrace = `evt-${event}-${Date.now().toString(36)}`
      console.log(LOG, 'onAuthStateChange ▶', {
        evTrace,
        event,
        다음세션있음: Boolean(nextSession?.user),
      })
      setLoading(true)
      try {
        console.log(
          LOG,
          'onAuthStateChange → auth 복구 경합 완화 위해 300ms 지연',
          { evTrace },
        )
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 300)
        })
        console.log(LOG, 'onAuthStateChange → processSession 직전', { evTrace })
        await processSessionRef.current(nextSession)
        if (!alive) return
        console.log(LOG, 'onAuthStateChange → processSession 직후', {
          evTrace,
        })
      } catch (e) {
        console.error(LOG, 'onAuthStateChange 처리 예외', { evTrace, e })
      } finally {
        if (alive) {
          console.log(LOG, 'onAuthStateChange → setLoading(false)', {
            evTrace,
            event,
          })
          setLoading(false)
        }
      }
    })

    return () => {
      alive = false
      listener.unsubscribe()
    }
  }, [])

  /** 이용 기간 경과 등 — 주기적으로 세션 갱신 후 차단 */
  useEffect(() => {
    if (!session?.user?.id || !isSupabaseConfigured) return
    const userId = session.user.id
    const accessToken = session.access_token

    async function revalidate() {
      const revId = `reval-${Date.now().toString(36)}`
      console.log(LOG, '재검증 ▶', {
        revId,
        userIdPrefix: userId.slice(0, 8),
        accessToken넘김: Boolean(accessToken?.length),
        t: new Date().toISOString(),
      })
      let sub: UserSubscriptionRow | null
      try {
        sub = await fetchUserSubscription(userId, accessToken)
      } catch (e) {
        if (e instanceof SubscriptionFetchTimeoutError) {
          console.warn(LOG, '재검증: 구독 조회 타임아웃 — 상태 유지', {
            revId,
            message: (e as Error).message,
          })
          return
        }
        throw e
      }
      console.log(LOG, '재검증 조회 결과', {
        revId,
        sub있음: Boolean(sub),
        허용: Boolean(sub && canAccessWithSubscription(sub)),
      })
      if (!sub || !canAccessWithSubscription(sub)) {
        await supabase.auth.signOut()
        setExpiryNoticeAndSignOut()
        setSubscription(null)
        setSession(null)
      } else {
        setSubscription(sub)
      }
    }

    const id = window.setInterval(
      () => {
        void revalidate()
      },
      60 * 1000,
    )

    function onVis() {
      if (document.visibilityState === 'visible') void revalidate()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [session?.user?.id, session?.access_token])

  const signIn = useCallback(
    async (email: string, password: string) => {
      console.log(LOG, 'signIn ▶ signInWithPassword 요청', {
        emailPrefix: `${email.slice(0, 3)}…`,
        t: new Date().toISOString(),
      })
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        console.log(LOG, 'signIn 실패', { message: error.message })
        return { error: new Error(error.message) }
      }
      console.log(LOG, 'signIn 비번 검증 OK', {
        userIdPrefix: data.user?.id?.slice(0, 8) ?? null,
      })

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
          console.warn(LOG, 'signIn: 구독 조회 타임아웃 — 일단 앱 진입 허용', {
            message: (e as Error).message,
          })
          setSubscription(null)
          setSession(data.session)
          return { error: null }
        }
        throw e
      }
      if (!sub || !canAccessWithSubscription(sub)) {
        await supabase.auth.signOut()
        setSubscription(null)
        setSession(null)
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
      console.log(LOG, 'signIn ■ 완료 (구독 반영)')
      return { error: null }
    },
    [],
  )

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    console.log(LOG, 'signOut (버튼) 호출')
    await supabase.auth.signOut()
    setSubscription(null)
    setSession(null)
    console.log(LOG, 'signOut 로컬 상태 초기화 완료')
  }, [])

  const refreshSubscription = useCallback(async () => {
    const uid = session?.user?.id
    console.log(LOG, 'refreshSubscription 호출', {
      uidPrefix: uid ? uid.slice(0, 8) : null,
      accessToken넘김: Boolean(session?.access_token?.length),
    })
    if (!uid || !isSupabaseConfigured) return
    let sub: UserSubscriptionRow | null
    try {
      sub = await fetchUserSubscription(uid, session?.access_token ?? null)
    } catch (e) {
      if (e instanceof SubscriptionFetchTimeoutError) {
        console.warn(LOG, 'refreshSubscription: 타임아웃 — 로그아웃하지 않음', {
          message: (e as Error).message,
        })
        return
      }
      throw e
    }
    setSubscription(sub)
    console.log(LOG, 'refreshSubscription 조회 반영', {
      sub있음: Boolean(sub),
      허용: Boolean(sub && canAccessWithSubscription(sub)),
    })
    if (!sub || !canAccessWithSubscription(sub)) {
      await supabase.auth.signOut()
      if (!sub) setMissingSubscriptionNotice()
      else setExpiryNoticeAndSignOut()
      setSubscription(null)
      setSession(null)
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
      signOut,
      refreshSubscription,
    }),
    [session, subscription, loading, signIn, signUp, signOut, refreshSubscription],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
