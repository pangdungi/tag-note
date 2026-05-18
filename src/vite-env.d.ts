/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** `false`/`0` 이면 비밀변호 recover 를 항상 브라우저→Supabase 직접. */
  readonly VITE_AUTH_RECOVER_PROXY?: string
  /** 예: https://www.tagtagnote.com/api/auth/recover-request (로컬에서 프로덕션 프록시 쓸 때) */
  readonly VITE_AUTH_RECOVER_PROXY_URL?: string
  /** `true`/`1` 이면 개발 서버에서도 구독·체험 기간 없으면 로그아웃(프로덕션과 동일). */
  readonly VITE_ENFORCE_SUBSCRIPTION_IN_DEV?: string
  /** `true`/`1` 이면 구독 게이트 완전 비활성(디버그용). */
  readonly VITE_SKIP_SUBSCRIPTION_GATE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
