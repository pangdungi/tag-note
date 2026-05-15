export const AUTH_NOTICE_KEY = 'tag_note_auth_notice'

export type SubscriptionStatus = 'active' | 'inactive'

export type UserSubscriptionRow = {
  user_id: string
  email: string | null
  subscription_status: SubscriptionStatus
  period_start: string
  period_end: string
}

export function isWithinSubscriptionPeriod(
  row: UserSubscriptionRow,
  at: Date = new Date(),
): boolean {
  const t = at.getTime()
  const start = new Date(row.period_start).getTime()
  const end = new Date(row.period_end).getTime()
  return t >= start && t <= end
}

/** 로그인·앱 이용 허용: 기간 내이면 status 무관(체험 inactive 포함). */
export function canAccessWithSubscription(
  row: UserSubscriptionRow | null,
  at: Date = new Date(),
): boolean {
  if (!row) return false
  return isWithinSubscriptionPeriod(row, at)
}

/**
 * 내 계정 표시 문구 (요구사항)
 * - inactive + 기간 내 → 체험기간 중
 * - active + 기간 만료 → 구독 만료
 * - active + 기간 내 → 구독중
 * - inactive + 만료 → 이용 만료
 */
export function accountSubscriptionLabel(
  row: UserSubscriptionRow,
  at: Date = new Date(),
): string {
  const inside = isWithinSubscriptionPeriod(row, at)
  if (row.subscription_status === 'inactive' && inside) return '체험기간 중'
  if (row.subscription_status === 'active' && !inside) return '구독 만료'
  if (row.subscription_status === 'active' && inside) return '구독중'
  return '이용 만료'
}
