/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** `false`/`0` 이면 비밀변호 recover 를 항상 브라우저→Supabase 직접. */
  readonly VITE_AUTH_RECOVER_PROXY?: string
  /** 예: https://www.tagtagnote.com/api/auth/recover-request (로컬에서 프로덕션 프록시 쓸 때) */
  readonly VITE_AUTH_RECOVER_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
