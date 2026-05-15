import { useState } from 'react'
import { isSupabaseConfigured, isSupabaseAnonKeyPlausible } from '../lib/supabase'
import { userFacingAuthMessage } from '../lib/authUserMessages'
import { AUTH_NOTICE_KEY, AUTH_SUCCESS_NOTICE_KEY } from '../lib/subscription'
import { useAuth } from '../contexts/useAuth'

type Mode = 'login' | 'signup' | 'forgot'

export function LoginPage() {
  const { signIn, signUp, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(() => {
    try {
      const msg = sessionStorage.getItem(AUTH_SUCCESS_NOTICE_KEY)
      if (msg) {
        sessionStorage.removeItem(AUTH_SUCCESS_NOTICE_KEY)
        return msg
      }
    } catch {
      /* ignore */
    }
    return null
  })
  const [error, setError] = useState<string | null>(() => {
    try {
      const msg = sessionStorage.getItem(AUTH_NOTICE_KEY)
      if (msg) {
        sessionStorage.removeItem(AUTH_NOTICE_KEY)
        return msg
      }
    } catch {
      /* SSR·비브라우저 */
    }
    return null
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email.trim(), password)
        if (err) {
          setError(userFacingAuthMessage(err.message, 'login'))
        }
      } else if (mode === 'forgot') {
        const { error: err } = await requestPasswordReset(email.trim())
        if (err) {
          setError(userFacingAuthMessage(err.message, 'forgot'))
        } else {
          setMessage(
            '비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.',
          )
        }
      } else {
        const { error: err } = await signUp(email.trim(), password)
        if (err) {
          setError(userFacingAuthMessage(err.message, 'signup'))
        } else {
          setMessage(
            '가입 확인 메일을 보냈을 수 있습니다. 메일함을 확인하거나 바로 로그인해 보세요. 로그인 후 7일 무료 체험이 이어집니다.',
          )
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

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
          <h1 className="auth-title">
            {mode === 'login'
              ? '로그인'
              : mode === 'signup'
                ? '회원가입'
                : '비밀번호 재설정'}
          </h1>

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
              같습니다. Supabase 대시보드 → Settings → API에서 키를 <strong>
                끝까지
              </strong>{' '}
              복사해 호스팅(예: Vercel) 환경 변수에 넣은 뒤{' '}
              <strong>다시 배포</strong>하세요.
            </p>
          ) : null}

          {mode !== 'forgot' ? (
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'tab tab-active' : 'tab'}
                onClick={() => {
                  setMode('login')
                  setError(null)
                  setMessage(null)
                }}
              >
                로그인
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={
                  mode === 'signup' ? 'tab tab-active' : 'tab'
                }
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setMessage(null)
                }}
              >
                회원가입
              </button>
            </div>
          ) : null}

          {mode === 'forgot' ? (
            <p className="auth-sub auth-sub--tight">
              가입하신 이메일을 입력하면 재설정 링크를 보냅니다.
            </p>
          ) : null}

          <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
            <label className="field">
              <span className="field-label">이메일</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </label>
            {mode !== 'forgot' ? (
              <label className="field">
                <span className="field-label">비밀번호</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                  minLength={6}
                />
              </label>
            ) : null}

            {mode === 'login' ? (
              <div className="auth-inline-actions auth-inline-actions--center">
                <button
                  type="button"
                  className="auth-text-link"
                  onClick={() => {
                    setMode('forgot')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  비밀번호를 잊었나요?
                </button>
              </div>
            ) : null}

            {mode === 'forgot' ? (
              <div className="auth-inline-actions auth-inline-actions--start">
                <button
                  type="button"
                  className="auth-text-link"
                  onClick={() => {
                    setMode('login')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  로그인으로 돌아가기
                </button>
              </div>
            ) : null}

            {error ? <p className="feedback feedback-error">{error}</p> : null}
            {message ? (
              <p className="feedback feedback-info">{message}</p>
            ) : null}

            <button
              type="submit"
              className="btn btn--emphasis btn--block"
              disabled={submitting}
            >
              {submitting
                ? '처리 중…'
                : mode === 'login'
                  ? '로그인'
                  : mode === 'forgot'
                    ? '재설정 링크 보내기'
                    : '가입하기'}
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}
