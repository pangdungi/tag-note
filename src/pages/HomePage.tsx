import { useAuth } from '../contexts/useAuth'

export function HomePage() {
  const { user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-brand">태그노트</p>
          <p className="app-greet">
            {user?.email ? `${user.email}님, 환영합니다.` : '환영합니다.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void signOut()}
        >
          로그아웃
        </button>
      </header>

      <section className="home-placeholder">
        <p className="home-lead">메모와 태그 기능은 다음 단계에서 붙입니다.</p>
        <div className="tag-row" aria-hidden>
          <span className="tag tag-a">#일상</span>
          <span className="tag tag-b">#프로젝트</span>
          <span className="tag tag-c">#메모</span>
          <span className="tag tag-d">#아침</span>
        </div>
      </section>
    </div>
  )
}
