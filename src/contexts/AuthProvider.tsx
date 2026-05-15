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
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  AUTH_NOTICE_KEY,
  canAccessWithSubscription,
  type UserSubscriptionRow,
} from '../lib/subscription'
import {
  fetchUserSubscription,
  SubscriptionFetchTimeoutError,
} from '../lib/subscriptionsApi'
import { loadAndApplyUserAppFontSafe } from '../lib/userPreferencesApi'
import { resetAppFontForSignedOut } from '../lib/appFont'
import { AuthContext } from './auth-context'

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

  const processSession = useCallback(async (next: Session | null) => {
    processInFlightRef.current += 1

    try {
      if (!next?.user) {
        setSubscription(null)
        setSession(null)
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

      if (!sub || !canAccessWithSubscription(sub)) {
        await supabase.auth.signOut()
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
        const { data } = await supabase.auth.getSession()
        if (!alive) {
          return
        }
        await processSessionRef.current(data.session ?? null)
        if (!alive) return
        setLoading(false)
      } catch {
        if (alive) setLoading(false)
      }
    })()

    const {
      data: { subscription: listener },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!alive) {
        return
      }
      if (event === 'INITIAL_SESSION') {
        return
      }
      setLoading(true)
      try {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 300)
        })
        await processSessionRef.current(nextSession)
        if (!alive) return
      } catch {
        /* 무시 */
      } finally {
        if (alive) {
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
      let sub: UserSubscriptionRow | null
      try {
        sub = await fetchUserSubscription(userId, accessToken)
      } catch (e) {
        if (e instanceof SubscriptionFetchTimeoutError) {
          return
        }
        throw e
      }
      if (!sub || !canAccessWithSubscription(sub)) {
        await supabase.auth.signOut()
        setExpiryNoticeAndSignOut()
        setSubscription(null)
        setSession(null)
        resetAppFontForSignedOut()
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
      if (!sub || !canAccessWithSubscription(sub)) {
        await supabase.auth.signOut()
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
      return { error: new Error('Supabase가 설정되지 않았습니다.') }
    }
    const redirectTo = `${window.location.origin}/auth/recovery`
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSubscription(null)
    setSession(null)
    resetAppFontForSignedOut()
  }, [])

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
    if (!sub || !canAccessWithSubscription(sub)) {
      await supabase.auth.signOut()
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
