/** Supabase Auth 등에서 오는 영문 메시지를 화면용 한글로 바꿉니다. */

type AuthFormMode = 'login' | 'signup' | 'forgot'

export function userFacingAuthMessage(raw: string, mode: AuthFormMode): string {
  const t = raw.trim()
  const low = t.toLowerCase()

  if (/invalid\s*api\s*key|api\s*key|apikey|\bjwt\b|fetch failed|failed to fetch/i.test(
    t,
  )) {
    return '연결 설정에 문제가 있습니다. 환경 변수와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
  }

  if (mode === 'login') {
    if (
      low.includes('invalid login credentials') ||
      low.includes('invalid_credentials')
    ) {
      return '비밀번호가 올바르지 않습니다. 이메일과 비밀번호를 다시 확인해 주세요.'
    }
    if (
      low.includes('email not confirmed') ||
      low.includes('email_not_confirmed')
    ) {
      return '이메일 인증을 완료한 뒤 다시 로그인해 주세요.'
    }
  }

  if (mode === 'signup') {
    if (
      low.includes('already registered') ||
      low.includes('user already registered') ||
      low.includes('already exists')
    ) {
      return '이미 가입된 이메일입니다. 로그인으로 진행해 주세요.'
    }
    if (
      low.includes('password') &&
      (low.includes('at least') || low.includes('characters') || low.includes('short'))
    ) {
      return '비밀번호는 안내한 글자 수 이상으로 입력해 주세요.'
    }
    if (low.includes('signup_disabled') || low.includes('signup is disabled')) {
      return '현재 새 계정 가입을 받지 않습니다.'
    }
  }

  if (mode === 'forgot') {
    /* recover용 fetch 타임아웃 시 SDK가 AbortError 문구를 그대로 넘김 → 서버 오류로 오해하지 않게 */
    if (
      low.includes('signal is aborted') ||
      low.includes('aborted without reason') ||
      low.includes('aborterror') ||
      (low.includes('abort') && low.includes('signal'))
    ) {
      return '비밀번호 재설정 요청이 끝나지 않았습니다. PC 방화벽·VPN·회사망이 supabase.co 연결을 막는 경우가 많습니다. 다른 네트워크(핫스팟 등)에서 다시 시도하거나 Network 탭에서 요청이 pending으로 남는지 확인해 주세요.'
    }
    if (
      low.includes('email not confirmed') ||
      low.includes('email_not_confirmed')
    ) {
      return '이메일 인증을 먼저 완료해 주세요.'
    }
  }

  if (
    low.includes('invalid email') ||
    low.includes('invalid_email') ||
    low.includes('unable to validate email')
  ) {
    return '이메일 형식을 확인해 주세요.'
  }

  if (
    low.includes('rate limit') ||
    low.includes('too many request') ||
    low.includes('over_email_send_rate_limit')
  ) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }

  /* updateUser(비밀번호 변경·재설정) 시 현재 비밀번호와 동일 — GoTrue: ErrorCodeSamePassword */
  if (
    low.includes('same_password') ||
    low.includes('new password should be different') ||
    low.includes('different from the old password')
  ) {
    return '새 비밀번호는 지금 사용 중인 비밀번호와 달라야 합니다. 이전에 쓰던 비밀번호와 다른 값을 입력해 주세요.'
  }

  if (
    low.includes('password update requires reauthentication') ||
    low.includes('reauthentication_needed') ||
    low.includes('requires reauthentication')
  ) {
    return '보안 정책상 다시 로그인한 뒤 비밀번호를 변경해야 합니다. 로그아웃 후 다시 로그인해 주세요.'
  }

  if (
    low.includes('current password required') ||
    low.includes('current_password_required') ||
    low.includes('current_password_mismatch')
  ) {
    return '현재 비밀번호 확인이 필요합니다. 올바른 현재 비밀번호를 입력했는지 확인해 주세요.'
  }

  if (/[가-힣]/.test(t)) {
    return t
  }

  return '요청을 처리하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.'
}
