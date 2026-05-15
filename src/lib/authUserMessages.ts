/** Supabase Auth 등에서 오는 영문 메시지를 화면용 한글로 바꿉니다. */

type AuthFormMode = 'login' | 'signup'

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

  if (/[가-힣]/.test(t)) {
    return t
  }

  return '요청을 처리하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.'
}
