export const AUTH_NOTICE_KEY = 'tag_note_auth_notice'

/** 로그인 화면에 한 번 표시할 안내(성공 등). */
export const AUTH_SUCCESS_NOTICE_KEY = 'tag_note_auth_success_notice'

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
 * 구독·체험 기간이 없거나 만료면 세션을 끊을지.
 *
 * - **프로덕션 빌드:** 기본 `true` (게이트 적용).
 * - **`npm run dev`:** 기본 `false` — DB에 `user_subscriptions`가 없어도 로그인 유지.
 * - `.env`에 `VITE_ENFORCE_SUBSCRIPTION_IN_DEV=true` → 개발에서도 프로덕션과 동일하게 게이트.
 * - `VITE_SKIP_SUBSCRIPTION_GATE=true` → 어디서든 게이트 끔(디버그용).
 */
export function isSubscriptionGateActive(): boolean {
  const skip =
    import.meta.env.VITE_SKIP_SUBSCRIPTION_GATE === 'true' ||
    import.meta.env.VITE_SKIP_SUBSCRIPTION_GATE === '1'
  if (skip) {
    return false
  }

  const enforceInDev =
    import.meta.env.VITE_ENFORCE_SUBSCRIPTION_IN_DEV === 'true' ||
    import.meta.env.VITE_ENFORCE_SUBSCRIPTION_IN_DEV === '1'

  if (import.meta.env.DEV && !enforceInDev) {
    return false
  }

  return true
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
