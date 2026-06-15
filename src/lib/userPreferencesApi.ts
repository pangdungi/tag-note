import { supabase } from './supabase'
import {
  applyAppFontsToDocument,
  normalizeLegacyAppFontId,
  setStoredAppFontId,
  type AppFontChoiceId,
} from './appFont'

const DEFAULT_FONT: AppFontChoiceId = 'spoqa'

export async function fetchUserAppFontId(
  userId: string,
): Promise<AppFontChoiceId | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('app_font_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data?.app_font_id) return null
  return normalizeLegacyAppFontId(data.app_font_id)
}

/** 행이 없으면 삽입 후 기본 글꼴을 돌려줍니다. (사용자 설정 저장 시에만 호출) */
export async function ensureUserAppFontRow(
  userId: string,
): Promise<AppFontChoiceId> {
  const existing = await fetchUserAppFontId(userId)
  if (existing) return existing

  const { error } = await supabase
    .from('user_preferences')
    .insert({ user_id: userId })

  if (error && error.code !== '23505') throw error

  const after = await fetchUserAppFontId(userId)
  return after ?? DEFAULT_FONT
}

export async function upsertUserAppFontId(
  userId: string,
  id: AppFontChoiceId,
): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      app_font_id: id,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

/** 로그인 시 글꼴만 로컬 적용 — 서버 user_preferences는 읽지·쓰지 않음 */
export async function loadAndApplyUserAppFont(userId: string): Promise<void> {
  void userId
  applyAppFontsToDocument()
  setStoredAppFontId(DEFAULT_FONT)
}

export async function loadAndApplyUserAppFontSafe(
  userId: string,
): Promise<void> {
  try {
    await loadAndApplyUserAppFont(userId)
  } catch {
    applyAppFontsToDocument()
    setStoredAppFontId(DEFAULT_FONT)
  }
}
