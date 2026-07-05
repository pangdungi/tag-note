import { useCallback, useEffect, useId, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  APP_FONT_CHOICES,
  appFontChoiceById,
  applyAppFontToDocument,
  DEFAULT_APP_FONT_ID,
  setStoredAppFontId,
  waitForAppFonts,
  type AppFontChoiceId,
} from '../lib/appFont'
import {
  ensureUserAppFontRow,
  upsertUserAppFontId,
} from '../lib/userPreferencesApi'
import {
  accountSubscriptionLabel,
  type UserSubscriptionRow,
} from '../lib/subscription'
import { isSupabaseConfigured } from '../lib/supabase'
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
  const [withdrawPhase, setWithdrawPhase] = useState<'idle' | 'confirm'>('idle')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [appFontId, setAppFontId] = useState<AppFontChoiceId>(DEFAULT_APP_FONT_ID)
  const [fontLoading, setFontLoading] = useState(false)
  const [fontSavingId, setFontSavingId] = useState<AppFontChoiceId | null>(null)
  const [fontError, setFontError] = useState<string | null>(null)

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
    setFontError(null)
    void onAfterOpen()
    if (!isSupabaseConfigured) return
    setFontLoading(true)
    void (async () => {
      try {
        const id = await ensureUserAppFontRow(user.id)
        setAppFontId(id)
        applyAppFontToDocument(id)
        setStoredAppFontId(id)
      } catch {
        setFontError('글꼴 설정을 불러오지 못했습니다.')
      } finally {
        setFontLoading(false)
      }
    })()
  }, [open, onAfterOpen, user.id])

  async function handleFontPick(nextId: AppFontChoiceId) {
    if (fontSavingId || nextId === appFontId) return
    setFontError(null)
    setFontSavingId(nextId)
    setAppFontId(nextId)
    try {
      applyAppFontToDocument(nextId)
      setStoredAppFontId(nextId)
      if (isSupabaseConfigured) {
        await upsertUserAppFontId(user.id, nextId)
      }
      await waitForAppFonts(nextId)
    } catch {
      setFontError('글꼴을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setFontSavingId(null)
    }
  }

  if (!open) return null

  return (
    <div className="tag-manage-overlay" role="presentation">
      <div className="tag-manage-backdrop" aria-hidden="true" />
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
            <p className="tag-manage-account-font-lead">
              선택한 글꼴은 이 기기를 포함해 로그인할 때마다 적용됩니다.
            </p>
            {fontError ? (
              <p className="tag-manage-account-font-error" role="alert">
                {fontError}
              </p>
            ) : null}
            {fontLoading ? (
              <p className="tag-manage-account-font-loading" role="status">
                불러오는 중…
              </p>
            ) : (
              <ul className="tag-manage-account-font-list">
                {APP_FONT_CHOICES.map((choice) => {
                  const selected = appFontId === choice.id
                  const saving = fontSavingId === choice.id
                  return (
                    <li key={choice.id}>
                      <button
                        type="button"
                        className={`tag-manage-account-font-option${
                          selected ? ' tag-manage-account-font-option--selected' : ''
                        }`}
                        aria-pressed={selected}
                        disabled={fontSavingId !== null}
                        style={{
                          fontFamily: `'${appFontChoiceById(choice.id).cssFamily}', sans-serif`,
                        }}
                        onClick={() => void handleFontPick(choice.id)}
                      >
                        <span className="tag-manage-account-font-option-label">
                          {choice.label}
                        </span>
                        <span className="tag-manage-account-font-option-meta">
                          {saving ? '저장 중…' : selected ? '사용 중' : '선택'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
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
                      모든 메모·태그·구독 정보가 삭제되며{' '}
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
