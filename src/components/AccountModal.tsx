import { useEffect, useId, useState } from 'react'
import type { User } from '@supabase/supabase-js'

type Props = {
  open: boolean
  onClose: () => void
  user: User
  onSignOut: () => void | Promise<void>
}

function formatKoDateTime(iso: string | undefined): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return null
  }
}

function displayNameFromUser(user: User): string | null {
  const m = user.user_metadata ?? {}
  const v =
    (typeof m.full_name === 'string' && m.full_name.trim()) ||
    (typeof m.name === 'string' && m.name.trim()) ||
    (typeof m.display_name === 'string' && m.display_name.trim()) ||
    (typeof m.preferred_username === 'string' && m.preferred_username.trim())
  return v || null
}

export function AccountModal({ open, onClose, user, onSignOut }: Props) {
  const titleId = useId()
  const [signingOut, setSigningOut] = useState(false)

  const profileName = displayNameFromUser(user)
  const joinedAt = formatKoDateTime(user.created_at)

  useEffect(() => {
    if (!open) setSigningOut(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="tag-manage-overlay" role="presentation">
      <button
        type="button"
        className="tag-manage-backdrop"
        aria-label="닫기"
        onClick={() => onClose()}
      />
      <div
        className="tag-manage-dialog tag-manage-dialog--account"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tag-manage-head">
          <h2 id={titleId} className="tag-manage-title">
            내 계정
          </h2>
          <button
            type="button"
            className="tag-manage-close"
            aria-label="내 계정 닫기"
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>

        <div className="tag-manage-account-body">
          <section className="tag-manage-account-section" aria-label="계정 정보">
            <h3 className="tag-manage-account-section-title">계정 정보</h3>
            <dl className="tag-manage-account-dl">
              <div className="tag-manage-account-field">
                <dt>이메일</dt>
                <dd>{user.email ?? '—'}</dd>
              </div>
              {profileName ? (
                <div className="tag-manage-account-field">
                  <dt>프로필 이름</dt>
                  <dd>{profileName}</dd>
                </div>
              ) : null}
              {joinedAt ? (
                <div className="tag-manage-account-field">
                  <dt>가입일</dt>
                  <dd>{joinedAt}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="tag-manage-account-section" aria-label="구독">
            <h3 className="tag-manage-account-section-title">구독</h3>
            <p className="tag-manage-account-subscription">
              유료 구독·결제 연동은 아직 없습니다. 지금은 무료로 이용 중입니다.
              이후 플랜이 생기면 여기에 표시됩니다.
            </p>
            <button
              type="button"
              className="tag-manage-account-withdraw-link"
              disabled
              aria-disabled="true"
              title="곧 제공 예정입니다"
            >
              회원 탈퇴
            </button>
          </section>

          <div className="tag-manage-account-foot">
            <button
              type="button"
              className="btn btn--quiet tag-manage-account-signout"
              disabled={signingOut}
              onClick={() => {
                void (async () => {
                  setSigningOut(true)
                  try {
                    await onSignOut()
                    onClose()
                  } finally {
                    setSigningOut(false)
                  }
                })()
              }}
            >
              {signingOut ? '로그아웃 중…' : '로그아웃'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
