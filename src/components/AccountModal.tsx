import { useCallback, useEffect, useId, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  accountSubscriptionLabel,
  type UserSubscriptionRow,
} from '../lib/subscription'
import {
  APP_FONT_OPTIONS,
  applyAppFontToDocument,
  getStoredAppFontId,
  setStoredAppFontId,
  type AppFontChoiceId,
} from '../lib/appFont'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  ensureUserAppFontRow,
  upsertUserAppFontId,
} from '../lib/userPreferencesApi'
import { deleteOwnAccount } from '../lib/accountApi'

type Props = {
  open: boolean
  onClose: () => void
  user: User
  subscription: UserSubscriptionRow | null
  subscriptionEnabled: boolean
  onAfterOpen: () => void | Promise<void>
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

export function AccountModal({
  open,
  onClose,
  user,
  subscription,
  subscriptionEnabled,
  onAfterOpen,
  onSignOut,
}: Props) {
  const titleId = useId()
  const [signingOut, setSigningOut] = useState(false)
  const [appFontId, setAppFontId] = useState<AppFontChoiceId>(() =>
    getStoredAppFontId(),
  )
  const [withdrawPhase, setWithdrawPhase] = useState<'idle' | 'confirm'>('idle')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const profileName = displayNameFromUser(user)
  const joinedAt = formatKoDateTime(user.created_at)

  const handleClose = useCallback(() => {
    setSigningOut(false)
    setWithdrawPhase('idle')
    setDeleteError(null)
    setDeleteBusy(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    setWithdrawPhase('idle')
    setDeleteError(null)
    setDeleteBusy(false)
    void onAfterOpen()
  }, [open, onAfterOpen])

  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    let cancelled = false
    void (async () => {
      try {
        const id = await ensureUserAppFontRow(user.id)
        if (cancelled) return
        setAppFontId(id)
        setStoredAppFontId(id)
        applyAppFontToDocument(id)
      } catch {
        /* 마이그레이션 미적용·오프라인 등 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, user.id])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  if (!open) return null

  return (
    <div className="tag-manage-overlay" role="presentation">
      <button
        type="button"
        className="tag-manage-backdrop"
        aria-label="닫기"
        onClick={() => handleClose()}
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
            onClick={() => handleClose()}
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

          <section className="tag-manage-account-section" aria-label="글꼴">
            <h3 className="tag-manage-account-section-title">글꼴</h3>
            <p className="tag-manage-account-font-hint">
              선택한 글꼴은 <strong>계정에 저장</strong>되어 로그인하는 기기에서 같이
              쓰이고, 이 브라우저에는 빠른 적용을 위해 로컬에도 맞춰 둡니다.
            </p>
            <ul className="tag-manage-account-font-list" role="list">
              {APP_FONT_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <label className="tag-manage-account-font-option">
                    <input
                      type="radio"
                      name="tag-note-app-font"
                      value={opt.id}
                      checked={appFontId === opt.id}
                      onChange={() => {
                        setAppFontId(opt.id)
                        setStoredAppFontId(opt.id)
                        applyAppFontToDocument(opt.id)
                        if (isSupabaseConfigured) {
                          void upsertUserAppFontId(user.id, opt.id).catch(
                            () => {},
                          )
                        }
                      }}
                    />
                    <span className="tag-manage-account-font-option-text">
                      <span className="tag-manage-account-font-option-label">
                        {opt.label}
                      </span>
                      <span
                        className="tag-manage-account-font-preview"
                        style={{ fontFamily: opt.cssStack }}
                      >
                        다람쥐 헌 쳇바퀴에 타고파 The quick brown fox
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="tag-manage-account-section" aria-label="구독">
            <h3 className="tag-manage-account-section-title">구독·체험</h3>
            {subscriptionEnabled ? (
              subscription ? (
                <>
                  <dl className="tag-manage-account-dl">
                    <div className="tag-manage-account-field">
                      <dt>이용 상태</dt>
                      <dd className="tag-manage-account-status-line">
                        {accountSubscriptionLabel(subscription)}
                      </dd>
                    </div>
                    <div className="tag-manage-account-field">
                      <dt>이용 기간</dt>
                      <dd>
                        {formatKoDateTime(subscription.period_start) ?? '—'} ~{' '}
                        {formatKoDateTime(subscription.period_end) ?? '—'}
                      </dd>
                    </div>
                  </dl>
                  <p className="tag-manage-account-subscription tag-manage-account-subscription--note">
                    가입 시 7일 무료 체험이 적용됩니다. 결제 연동 후에는 유료
                    구독으로 기간이 갱신됩니다.
                  </p>
                </>
              ) : (
                <p className="tag-manage-account-subscription" role="status">
                  구독 정보를 불러오지 못했습니다. 잠시 후 다시 열어 보세요.
                </p>
              )
            ) : (
              <p className="tag-manage-account-subscription">
                Supabase에 연결하면 체험·이용 기간이 표시됩니다.
              </p>
            )}
            {isSupabaseConfigured ? (
              <div className="tag-manage-account-delete">
                {withdrawPhase === 'idle' ? (
                  <button
                    type="button"
                    className="tag-manage-account-withdraw-link"
                    onClick={() => {
                      setWithdrawPhase('confirm')
                      setDeleteError(null)
                    }}
                  >
                    회원 탈퇴
                  </button>
                ) : (
                  <div
                    className="tag-manage-account-delete-confirm"
                    role="group"
                    aria-label="회원 탈퇴 확인"
                  >
                    <p className="tag-manage-account-delete-warn">
                      모든 메모·태그·구독·글꼴 설정이 삭제되며{' '}
                      <strong>복구할 수 없습니다</strong>. 로그인 계정(이메일)도
                      함께 제거됩니다.
                    </p>
                    {deleteError ? (
                      <p className="tag-manage-account-delete-err" role="alert">
                        {deleteError}
                      </p>
                    ) : null}
                    <div className="tag-manage-account-delete-actions">
                      <button
                        type="button"
                        className="btn btn--quiet"
                        disabled={deleteBusy}
                        onClick={() => {
                          setWithdrawPhase('idle')
                          setDeleteError(null)
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="btn tag-manage-account-delete-confirm-btn"
                        disabled={deleteBusy}
                        onClick={() => {
                          void (async () => {
                            setDeleteBusy(true)
                            setDeleteError(null)
                            const { error } = await deleteOwnAccount()
                            setDeleteBusy(false)
                            if (error) {
                              setDeleteError(
                                '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.',
                              )
                              return
                            }
                            try {
                              await onSignOut()
                            } finally {
                              handleClose()
                            }
                          })()
                        }}
                      >
                        {deleteBusy ? '처리 중…' : '탈퇴하기'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
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
                    handleClose()
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
