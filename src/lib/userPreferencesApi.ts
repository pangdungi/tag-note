import { supabase } from './supabase'
import {
  applyAppFontToDocument,
  getStoredAppFontId,
  isAppFontChoiceId,
  setStoredAppFontId,
  type AppFontChoiceId,
} from './appFont'

const DEFAULT_FONT: AppFontChoiceId = 'system'

export async function fetchUserAppFontId(
  userId: string,
): Promise<AppFontChoiceId | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('app_font_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data?.app_font_id || !isAppFontChoiceId(data.app_font_id)) return null
  return data.app_font_id
}

/** 행이 없으면 삽입 후 기본 글꼴을 돌려줍니다. */
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

/** 서버 글꼴을 읽어 로컬 캐시·화면에 반영합니다. */
export async function loadAndApplyUserAppFont(userId: string): Promise<void> {
  const id = await ensureUserAppFontRow(userId)
  const resolved = isAppFontChoiceId(id) ? id : DEFAULT_FONT
  setStoredAppFontId(resolved)
  applyAppFontToDocument(resolved)
}

/** DB 마이그레이션 전·네트워크 오류 시 로컬 캐시로 폴백 */
export async function loadAndApplyUserAppFontSafe(
  userId: string,
): Promise<void> {
  try {
    await loadAndApplyUserAppFont(userId)
  } catch {
    applyAppFontToDocument(getStoredAppFontId())
  }
}
