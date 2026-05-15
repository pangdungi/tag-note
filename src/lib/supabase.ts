import { createClient } from '@supabase/supabase-js'

/** .env 미설정 시에도 앱이 로드되도록 하는 더미 값(API 호출은 실패함). */
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'

const url = import.meta.env.VITE_SUPABASE_URL || PLACEHOLDER_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PLACEHOLDER_ANON

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() &&
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
)

if (!isSupabaseConfigured) {
  console.warn(
    '[태그노트] .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 넣으면 인증이 동작합니다.',
  )
}

export const supabase = createClient(url, anonKey)

/** PostgREST 베이스 (`…/rest/v1` 앞까지, 끝 슬래시 없음) */
export const supabaseUrlForRest = url.replace(/\/$/, '')

/** anon 키 — 브라우저에서 직접 `fetch`할 때만 사용 (클라이언트 번들에 포함됨) */
export const supabaseAnonKey = anonKey

/** 디버그용(키 노출 없음). REST 요청이 어느 호스트로 가는지 확인. */
export const supabaseProjectHost = (() => {
  try {
    return new URL(url).hostname
  } catch {
    return '(invalid-url)'
  }
})()
