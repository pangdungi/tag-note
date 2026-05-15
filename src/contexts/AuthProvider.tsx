import {
  useCallback,
  useEffect,
  useMemo,
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
import { fetchUserSubscription } from '../lib/subscriptionsApi'
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

  const processSession = useCallback(async (next: Session | null) => {
    if (!next?.user) {
      setSubscription(null)
      setSession(null)
      return
    }

    if (!isSupabaseConfigured) {
      setSubscription(null)
      setSession(next)
      return
    }

    const sub = await fetchUserSubscription(next.user.id)
    if (!sub || !canAccessWithSubscription(sub)) {
      await supabase.auth.signOut()
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
  }, [])

  useEffect(() => {
    let alive = true

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      await processSession(data.session ?? null)
      if (!alive) return
      setLoading(false)
    })()

    const {
      data: { subscription: listener },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!alive) return
      setLoading(true)
      await processSession(nextSession)
      if (!alive) return
      setLoading(false)
    })

    return () => {
      alive = false
      listener.unsubscribe()
    }
  }, [processSession])

  /** 이용 기간 경과 등 — 주기적으로 세션 갱신 후 차단 */
  useEffect(() => {
    if (!session?.user?.id || !isSupabaseConfigured) return
    const userId = session.user.id

    async function revalidate() {
      const sub = await fetchUserSubscription(userId)
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
  }, [session?.user?.id])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) return { error: new Error(error.message) }

      if (!isSupabaseConfigured) {
        setSubscription(null)
        setSession(data.session)
        return { error: null }
      }

      const sub = await fetchUserSubscription(data.user.id)
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
      return { error: null }
    },
    [],
  )

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSubscription(null)
    setSession(null)
  }, [])

  const refreshSubscription = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid || !isSupabaseConfigured) return
    const sub = await fetchUserSubscription(uid)
    setSubscription(sub)
    if (!sub || !canAccessWithSubscription(sub)) {
      await supabase.auth.signOut()
      if (!sub) setMissingSubscriptionNotice()
      else setExpiryNoticeAndSignOut()
      setSubscription(null)
      setSession(null)
    }
  }, [session?.user?.id])

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
