import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured, isSupabaseAnonKeyPlausible } from '../lib/supabase'
import { userFacingAuthMessage } from '../lib/authUserMessages'
import { AUTH_SUCCESS_NOTICE_KEY } from '../lib/subscription'
import { useAuth } from '../contexts/useAuth'

export function RecoveryPage() {
  const navigate = useNavigate()
  const { session, loading, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== password2) {
      setError('비밀번호가 서로 일치하지 않습니다.')
      return
    }
    setSubmitting(true)
    console.info('[tag-note][auth] RecoveryPage updateUser 시작')
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      console.info('[tag-note][auth] RecoveryPage updateUser 끝', {
        error: err?.message ?? null,
      })
      if (err) {
        setError(userFacingAuthMessage(err.message, 'signup'))
        return
      }
      try {
        sessionStorage.setItem(
          AUTH_SUCCESS_NOTICE_KEY,
          '비밀번호가 변경되었습니다. 다시 로그인해 주세요.',
        )
      } catch {
        /* ignore */
      }
      await signOut()
      console.info('[tag-note][auth] RecoveryPage → /login 이동')
      navigate('/login', { replace: true })
    } catch (x) {
      console.error('[tag-note][auth] RecoveryPage submit 예외', x)
      setError('비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const ready = !loading
  const hasSession = Boolean(session?.user)

  return (
    <div className="auth-shell">
      <div className="auth-decor" aria-hidden>
        <span className="tag tag-a">#아이디어</span>
        <span className="tag tag-b">#사랑이란</span>
        <span className="tag tag-c">#읽을거리</span>
      </div>

      <div className="auth-stack">
        <span className="auth-mark">#태그노트</span>
        <main className="auth-card">
          <h1 className="auth-title">새 비밀번호 설정</h1>
          <p className="auth-sub">
            메일로 받은 링크가 유효할 때만 이 화면에서 비밀번호를 바꿀 수
            있습니다.
          </p>

          {!isSupabaseConfigured ? (
            <p className="feedback feedback-warn" role="status">
              프로젝트 루트에 <code className="inline-code">.env</code>를 만들고{' '}
              <code className="inline-code">VITE_SUPABASE_URL</code>,{' '}
              <code className="inline-code">VITE_SUPABASE_ANON_KEY</code>를
              설정한 뒤 개발 서버를 다시 실행하세요.
            </p>
          ) : null}

          {isSupabaseConfigured && !isSupabaseAnonKeyPlausible() ? (
            <p className="feedback feedback-warn" role="status">
              배포 사이트의 Supabase <strong>anon(공개) 키</strong>가 짧게 들어간 것
              같습니다. Supabase 대시보드 → Settings → API에서 키를{' '}
              <strong>끝까지</strong> 복사해 호스팅 환경 변수에 넣은 뒤{' '}
              <strong>다시 배포</strong>하세요.
            </p>
          ) : null}

          {ready && !hasSession ? (
            <>
              <p className="feedback feedback-error" role="status">
                링크가 만료되었거나 잘못되었을 수 있습니다. 로그인 화면에서 비밀번호
                재설정을 다시 요청해 주세요.
              </p>
              <Link className="btn btn--emphasis btn--block" to="/login">
                로그인으로 이동
              </Link>
            </>
          ) : null}

          {!ready ? (
            <p className="feedback feedback-info" role="status">
              확인 중…
            </p>
          ) : null}

          {ready && hasSession ? (
            <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
              <label className="field">
                <span className="field-label">새 비밀번호</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                  minLength={6}
                />
              </label>
              <label className="field">
                <span className="field-label">새 비밀번호 확인</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password2}
                  onChange={(ev) => setPassword2(ev.target.value)}
                  required
                  minLength={6}
                />
              </label>

              {error ? <p className="feedback feedback-error">{error}</p> : null}

              <button
                type="submit"
                className="btn btn--emphasis btn--block"
                disabled={submitting}
              >
                {submitting ? '저장 중…' : '비밀번호 변경'}
              </button>
            </form>
          ) : null}
        </main>
      </div>
    </div>
  )
}
