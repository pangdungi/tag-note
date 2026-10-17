import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AlertModal } from '../components/AlertModal'
import { useAuth } from '../contexts/useAuth'
import {
  isAdminUnlocked,
  isAppAdminUser,
  tryUnlockAdminWithKey,
} from '../lib/adminAccess'
import {
  adminGrantOneYear,
  adminListImwebOrderGrants,
  adminListSubscriptions,
  adminListUserDeletions,
  adminSetSubscription,
  type AdminDeletionRow,
  type AdminImwebGrantRow,
  type AdminSubscriptionRow,
} from '../lib/adminSubscriptionApi'

const IMWEB_PROD_YEAR = 69

type AdminSectionId = 'all' | 'trial' | 'year' | 'expired' | 'imweb' | 'withdrawn'

const ADMIN_SECTIONS: {
  id: AdminSectionId
  label: string
  hint: string
  toolbarLabel: string
}[] = [
  {
    id: 'all',
    label: '전체 목록',
    hint: '모든 회원의 이용권·만료일을 보고 고칠 수 있습니다.',
    toolbarLabel: '이용권 목록',
  },
  {
    id: 'trial',
    label: '테스트권',
    hint: '테스트 이용권(7일) 회원입니다.',
    toolbarLabel: '테스트권 회원',
  },
  {
    id: 'year',
    label: '1년권',
    hint: '1년 이용권 회원입니다.',
    toolbarLabel: '1년권 회원',
  },
  {
    id: 'expired',
    label: '이용 만료',
    hint: '이용 종료일이 지난 회원입니다. 갱신권 구매 확인 후 1년 이용권을 부여하세요.',
    toolbarLabel: '이용 만료 회원',
  },
  {
    id: 'imweb',
    label: '아임웹 구매',
    hint: '자사몰에서 이용권을 결제한 주문만 봅니다. 한 사람이 여러 번 샀으면 여러 줄입니다.',
    toolbarLabel: '아임웹 구매',
  },
  {
    id: 'withdrawn',
    label: '탈퇴 회원',
    hint: '회원 탈퇴로 삭제된 계정 기록입니다. (탈퇴 기능 적용 이후부터 기록됩니다.)',
    toolbarLabel: '탈퇴 회원 기록',
  },
]

function formatKoDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromDatetimeLocalValue(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function accessUntilOf(row: AdminSubscriptionRow) {
  return row.access_until || row.period_end
}

function isRowExpired(row: AdminSubscriptionRow) {
  const until = accessUntilOf(row)
  if (!until) return false
  const endMs = new Date(until).getTime()
  return !Number.isNaN(endMs) && Date.now() > endMs
}

function isYearPass(row: AdminSubscriptionRow) {
  return String(row.subscription_status || '').toLowerCase() === 'active'
}

function passKindLabel(row: AdminSubscriptionRow) {
  return isYearPass(row) ? '1년권' : '테스트권'
}

function imwebProdLabel(prodNo: number) {
  if (Number(prodNo) === IMWEB_PROD_YEAR) return '1년권'
  return Number.isFinite(Number(prodNo)) ? `상품 ${prodNo}` : '—'
}

function imwebGrantStatusLabel(status: string | null) {
  const v = String(status || '').toLowerCase()
  if (v === 'applied') return '반영됨'
  if (v === 'pending') return '대기'
  if (v === 'ignored') return '무시'
  return v || '—'
}

function normalizeEmailSearchQuery(query: string) {
  return query.trim().toLowerCase()
}

function looksLikeMissingRpc(error: string) {
  return /permission denied|42501|P0001|function.*does not exist|not find/i.test(
    error,
  )
}

function shortUid(uid: string | null | undefined) {
  const id = String(uid || '')
  return id ? `${id.slice(0, 8)}…` : '—'
}

export function AdminPage() {
  const { user } = useAuth()
  const [unlocked, setUnlocked] = useState(() => isAdminUnlocked())
  const [secretInput, setSecretInput] = useState('')
  const [secretError, setSecretError] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(true)
  const [section, setSection] = useState<AdminSectionId>('all')
  const [subs, setSubs] = useState<AdminSubscriptionRow[]>([])
  const [withdrawn, setWithdrawn] = useState<AdminDeletionRow[]>([])
  const [imweb, setImweb] = useState<AdminImwebGrantRow[]>([])
  const [emailQuery, setEmailQuery] = useState('')
  const [statusLine, setStatusLine] = useState('')
  const [loading, setLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(
    null,
  )
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<
    Record<string, { status: string; until: string }>
  >({})

  const meta = ADMIN_SECTIONS.find((s) => s.id === section) || ADMIN_SECTIONS[0]

  const filteredSubsBase = useMemo(() => {
    if (section === 'expired') return subs.filter(isRowExpired)
    if (section === 'trial') return subs.filter((row) => !isYearPass(row))
    if (section === 'year') return subs.filter(isYearPass)
    return subs
  }, [section, subs])

  const q = normalizeEmailSearchQuery(emailQuery)

  const filteredSubs = useMemo(() => {
    if (!q) return filteredSubsBase
    return filteredSubsBase.filter((row) =>
      String(row.email || '').toLowerCase().includes(q),
    )
  }, [filteredSubsBase, q])

  const filteredWithdrawn = useMemo(() => {
    if (!q) return withdrawn
    return withdrawn.filter((row) =>
      String(row.email || '').toLowerCase().includes(q),
    )
  }, [withdrawn, q])

  const filteredImweb = useMemo(() => {
    if (!q) return imweb
    return imweb.filter((row) =>
      String(row.orderer_email || '').toLowerCase().includes(q),
    )
  }, [imweb, q])

  const loadSection = useCallback(
    async (id: AdminSectionId, force: boolean) => {
      setTableError(null)
      if (id === 'withdrawn') {
        if (!force && withdrawn.length) return
        setLoading(true)
        setStatusLine('불러오는 중…')
        const r = await adminListUserDeletions()
        setLoading(false)
        if (!r.ok) {
          setStatusLine('')
          setAlert({ title: '탈퇴 목록', message: r.error || '불러오지 못했어요.' })
          if (looksLikeMissingRpc(r.error)) {
            setTableError(
              `DB에 tn_admin_list_user_deletions 권한/함수가 없을 수 있어요. Supabase SQL 마이그레이션을 적용해 주세요. ${r.error}`,
            )
          }
          return
        }
        setWithdrawn(r.data || [])
        return
      }
      if (id === 'imweb') {
        if (!force && imweb.length) return
        setLoading(true)
        setStatusLine('불러오는 중…')
        const r = await adminListImwebOrderGrants()
        setLoading(false)
        if (!r.ok) {
          setStatusLine('')
          setAlert({ title: '아임웹 목록', message: r.error || '불러오지 못했어요.' })
          if (looksLikeMissingRpc(r.error)) {
            setTableError(
              `DB에 tn_admin_list_imweb_order_grants 권한/함수가 없을 수 있어요. Supabase SQL 마이그레이션을 적용해 주세요. ${r.error}`,
            )
          }
          return
        }
        setImweb(r.data || [])
        return
      }
      if (!force && subs.length) return
      setLoading(true)
      setStatusLine('불러오는 중…')
      const r = await adminListSubscriptions()
      setLoading(false)
      if (!r.ok) {
        setStatusLine('')
        setAlert({ title: '이용권 목록', message: r.error || '불러오지 못했어요.' })
        if (looksLikeMissingRpc(r.error)) {
          setTableError(
            `DB에 tn_admin_list_subscriptions 권한/함수가 없을 수 있어요. Supabase SQL 마이그레이션을 적용해 주세요. ${r.error}`,
          )
        }
        return
      }
      setSubs(r.data || [])
    },
    [imweb.length, subs.length, withdrawn.length],
  )

  useEffect(() => {
    if (!unlocked || !isAppAdminUser(user)) return
    void loadSection(section, false)
  }, [loadSection, section, unlocked, user])

  useEffect(() => {
    if (loading) return
    if (tableError) {
      setStatusLine('')
      return
    }
    if (section === 'withdrawn') {
      if (!filteredWithdrawn.length) {
        setStatusLine(
          q
            ? `「${emailQuery.trim()}」 검색 결과가 없어요.`
            : '탈퇴 기록이 없어요.',
        )
        return
      }
      setStatusLine(
        q && filteredWithdrawn.length < withdrawn.length
          ? `검색 ${filteredWithdrawn.length}명 · ${withdrawn.length}명 중`
          : `총 ${filteredWithdrawn.length}명`,
      )
      return
    }
    if (section === 'imweb') {
      if (!filteredImweb.length) {
        setStatusLine(
          q
            ? `「${emailQuery.trim()}」 검색 결과가 없어요.`
            : '아임웹 구매 기록이 없어요.',
        )
        return
      }
      setStatusLine(
        q && filteredImweb.length < imweb.length
          ? `검색 ${filteredImweb.length}건 · ${imweb.length}건 중`
          : `총 ${filteredImweb.length}건`,
      )
      return
    }
    if (!filteredSubs.length) {
      setStatusLine(
        q
          ? `「${emailQuery.trim()}」 검색 결과가 없어요.`
          : section === 'expired'
            ? '이용 만료 회원이 없어요.'
            : section === 'trial'
              ? '테스트권 회원이 없어요.'
              : section === 'year'
                ? '1년권 회원이 없어요.'
                : '표시할 사용자가 없어요.',
      )
      return
    }
    setStatusLine(
      q && filteredSubs.length < filteredSubsBase.length
        ? `검색 ${filteredSubs.length}명 · ${filteredSubsBase.length}명 중`
        : `총 ${filteredSubs.length}명`,
    )
  }, [
    emailQuery,
    filteredImweb.length,
    filteredSubs.length,
    filteredSubsBase.length,
    filteredWithdrawn.length,
    imweb.length,
    loading,
    q,
    section,
    tableError,
    withdrawn.length,
  ])

  if (!isAppAdminUser(user)) {
    return <Navigate to="/" replace />
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (!tryUnlockAdminWithKey(secretInput)) {
      setSecretError('시크릿 키가 맞지 않습니다.')
      return
    }
    setSecretError(null)
    setUnlocked(true)
  }

  function patchSub(patched: AdminSubscriptionRow) {
    setSubs((prev) =>
      prev.map((row) =>
        row.user_id === patched.user_id ? { ...row, ...patched } : row,
      ),
    )
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[patched.user_id]
      return next
    })
  }

  function draftOf(row: AdminSubscriptionRow) {
    return (
      drafts[row.user_id] || {
        status: String(row.subscription_status || 'inactive').toLowerCase(),
        until: toDatetimeLocalValue(accessUntilOf(row)),
      }
    )
  }

  async function handleGrant(row: AdminSubscriptionRow) {
    setBusyUserId(row.user_id)
    const r = await adminGrantOneYear(row.user_id)
    setBusyUserId(null)
    if (!r.ok || !r.data) {
      setAlert({ title: '1년 이용권', message: r.error || '처리에 실패했어요.' })
      return
    }
    patchSub(r.data)
    setAlert({
      title: '1년 이용권',
      message: '가입일 기준 1년으로 설정하고 active로 바꿨어요.',
    })
  }

  async function handleSave(row: AdminSubscriptionRow) {
    const draft = draftOf(row)
    const iso = fromDatetimeLocalValue(draft.until)
    if (!iso) {
      setAlert({ title: '저장', message: '이용 만료일을 확인해 주세요.' })
      return
    }
    setBusyUserId(row.user_id)
    const r = await adminSetSubscription(row.user_id, draft.status, iso)
    setBusyUserId(null)
    if (!r.ok || !r.data) {
      setAlert({ title: '저장', message: r.error || '저장에 실패했어요.' })
      return
    }
    patchSub(r.data)
    setAlert({ title: '저장', message: '저장했어요.' })
  }

  if (!unlocked) {
    return (
      <div className="admin-view admin-view--gate">
        <form className="admin-unlock-form" onSubmit={handleUnlock}>
          <h1 className="admin-view-title">관리자전용</h1>
          <p className="admin-view-hint">시크릿 키를 입력해야 들어갈 수 있습니다.</p>
          <div className="password-input-wrap admin-unlock-input-wrap">
            <input
              type={showSecret ? 'text' : 'password'}
              className="admin-unlock-input password-input"
              value={secretInput}
              onChange={(e) => {
                setSecretInput(e.target.value)
                setSecretError(null)
              }}
              placeholder="시크릿 키"
              autoComplete="off"
              autoFocus
              aria-label="시크릿 키"
            />
            <button
              type="button"
              className="password-input-toggle"
              onClick={() => setShowSecret((open) => !open)}
              aria-label={showSecret ? '시크릿 키 숨기기' : '시크릿 키 보기'}
              aria-pressed={showSecret}
            >
              {showSecret ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {secretError ? <p className="admin-unlock-error">{secretError}</p> : null}
          <div className="admin-unlock-actions">
            <button type="submit" className="admin-subs-btn admin-subs-btn--save">
              들어가기
            </button>
            <Link to="/" className="admin-unlock-back">
              돌아가기
            </Link>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="admin-view">
      <header className="admin-view-header">
        <h1 className="admin-view-title">관리자전용</h1>
        <Link to="/" className="admin-view-home">
          홈
        </Link>
      </header>
      <div className="admin-view-body admin-subs-page">
        <nav className="admin-section-nav" aria-label="관리자 메뉴">
          {ADMIN_SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-section-nav-btn${section === item.id ? ' is-active' : ''}`}
              aria-pressed={section === item.id}
              onClick={() => {
                if (section === item.id) {
                  void loadSection(item.id, true)
                  return
                }
                setSection(item.id)
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="admin-view-hint">{meta.hint}</p>
        <div className="admin-subs-toolbar">
          <span className="admin-subs-toolbar-label">{meta.toolbarLabel}</span>
          <button
            type="button"
            className="admin-subs-refresh"
            onClick={() => void loadSection(section, true)}
          >
            새로고침
          </button>
        </div>
        <div className="admin-subs-search">
          <input
            type="text"
            className="admin-subs-search-input"
            placeholder="이메일 검색…"
            aria-label="이메일 검색"
            autoComplete="off"
            inputMode="email"
            value={emailQuery}
            onChange={(e) => setEmailQuery(e.target.value)}
          />
        </div>
        <p className="admin-subs-statusline" aria-live="polite">
          {statusLine}
        </p>
        <div className="admin-subs-table-wrap">
          {section === 'withdrawn' ? (
            <table className="admin-subs-table" role="grid">
              <thead>
                <tr>
                  <th scope="col">이메일</th>
                  <th scope="col">사용자 ID</th>
                  <th scope="col">탈퇴 일시</th>
                </tr>
              </thead>
              <tbody>
                {tableError ? (
                  <tr>
                    <td colSpan={3}>
                      <p className="admin-subs-err">{tableError}</p>
                    </td>
                  </tr>
                ) : (
                  filteredWithdrawn.map((row) => (
                    <tr
                      key={`${row.id}-${row.user_id}`}
                      className="admin-subs-tr admin-subs-tr--withdrawn"
                    >
                      <td className="admin-subs-td admin-subs-td--email">
                        {row.email || '—'}
                      </td>
                      <td
                        className="admin-subs-td admin-subs-td--uid"
                        title={row.user_id}
                      >
                        {shortUid(row.user_id)}
                      </td>
                      <td className="admin-subs-td admin-subs-td--dt">
                        {formatKoDateTime(row.deleted_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : section === 'imweb' ? (
            <table className="admin-subs-table" role="grid">
              <thead>
                <tr>
                  <th scope="col">이메일</th>
                  <th scope="col">상품</th>
                  <th scope="col">주문번호</th>
                  <th scope="col">구매일</th>
                  <th scope="col">반영</th>
                  <th scope="col">이용 종료(부여 후)</th>
                </tr>
              </thead>
              <tbody>
                {tableError ? (
                  <tr>
                    <td colSpan={6}>
                      <p className="admin-subs-err">{tableError}</p>
                    </td>
                  </tr>
                ) : (
                  filteredImweb.map((row) => (
                    <tr
                      key={`${row.order_no}-${row.orderer_email}`}
                      className="admin-subs-tr admin-subs-tr--imweb"
                    >
                      <td className="admin-subs-td admin-subs-td--email">
                        {row.orderer_email || '—'}
                      </td>
                      <td className="admin-subs-td admin-subs-td--pass">
                        <span
                          className={`admin-subs-pass-kind ${
                            Number(row.prod_no) === IMWEB_PROD_YEAR
                              ? 'admin-subs-pass-kind--year'
                              : 'admin-subs-pass-kind--trial'
                          }`}
                        >
                          {imwebProdLabel(row.prod_no)}
                        </span>
                      </td>
                      <td className="admin-subs-td admin-subs-td--uid">
                        {row.order_no != null ? String(row.order_no) : '—'}
                      </td>
                      <td className="admin-subs-td admin-subs-td--dt">
                        {formatKoDateTime(row.created_at)}
                      </td>
                      <td className="admin-subs-td">
                        {imwebGrantStatusLabel(row.grant_status)}
                      </td>
                      <td className="admin-subs-td admin-subs-td--dt">
                        {formatKoDateTime(row.access_until_after)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="admin-subs-table" role="grid">
              <thead>
                <tr>
                  <th scope="col">이메일</th>
                  <th scope="col">이용권</th>
                  <th scope="col">사용자 ID</th>
                  <th scope="col">가입(기록)</th>
                  <th scope="col">상태</th>
                  <th scope="col">이용 만료(까지)</th>
                  <th scope="col">처리</th>
                </tr>
              </thead>
              <tbody>
                {tableError ? (
                  <tr>
                    <td colSpan={7}>
                      <p className="admin-subs-err">{tableError}</p>
                    </td>
                  </tr>
                ) : (
                  filteredSubs.map((row) => {
                    const draft = draftOf(row)
                    const expired = isRowExpired(row)
                    const year = isYearPass(row)
                    return (
                      <tr
                        key={row.user_id}
                        className={`admin-subs-tr${expired ? ' admin-subs-tr--expired' : ''}`}
                      >
                        <td className="admin-subs-td admin-subs-td--email">
                          {row.email || '—'}
                        </td>
                        <td className="admin-subs-td admin-subs-td--pass">
                          <span
                            className={`admin-subs-pass-kind ${
                              year
                                ? 'admin-subs-pass-kind--year'
                                : 'admin-subs-pass-kind--trial'
                            }`}
                          >
                            {passKindLabel(row)}
                          </span>
                          {expired ? (
                            <span className="admin-subs-pass-expired">만료</span>
                          ) : null}
                        </td>
                        <td
                          className="admin-subs-td admin-subs-td--uid"
                          title={row.user_id}
                        >
                          {shortUid(row.user_id)}
                        </td>
                        <td className="admin-subs-td admin-subs-td--dt admin-subs-td--signup">
                          {formatKoDateTime(row.signup_at || row.period_start)}
                        </td>
                        <td className="admin-subs-td admin-subs-td--form">
                          <select
                            className="admin-subs-status"
                            aria-label="이용권"
                            value={draft.status}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.user_id]: {
                                  ...draft,
                                  status: e.target.value,
                                },
                              }))
                            }
                          >
                            <option value="inactive">테스트권</option>
                            <option value="active">1년권</option>
                          </select>
                        </td>
                        <td className="admin-subs-td admin-subs-td--form">
                          <input
                            type="datetime-local"
                            className="admin-subs-until"
                            aria-label="이용 만료(까지)"
                            value={draft.until}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.user_id]: {
                                  ...draft,
                                  until: e.target.value,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="admin-subs-td admin-subs-td--actions">
                          <div className="admin-subs-action-btns">
                            <button
                              type="button"
                              className="admin-subs-btn admin-subs-btn--year"
                              disabled={busyUserId === row.user_id}
                              onClick={() => void handleGrant(row)}
                            >
                              1년 이용권 부여
                            </button>
                            <button
                              type="button"
                              className="admin-subs-btn admin-subs-btn--save"
                              disabled={busyUserId === row.user_id}
                              onClick={() => void handleSave(row)}
                            >
                              상태·만료일 저장
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <AlertModal
        open={Boolean(alert)}
        title={alert?.title || ''}
        message={alert?.message || ''}
        onClose={() => setAlert(null)}
      />
    </div>
  )
}
