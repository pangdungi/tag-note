import { supabase } from './supabase'
import {
  applyAppFontToDocument,
  DEFAULT_APP_FONT_ID,
  getStoredAppFontId,
  normalizeLegacyAppFontId,
  setStoredAppFontId,
  waitForAppFonts,
  type AppFontChoiceId,
} from './appFont'

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

/** 행이 없으면 삽입 후 기본 글꼴을 돌려줍니다. */
export async function ensureUserAppFontRow(
  userId: string,
): Promise<AppFontChoiceId> {
  const existing = await fetchUserAppFontId(userId)
  if (existing) return existing

  const { error } = await supabase
    .from('user_preferences')
    .insert({ user_id: userId, app_font_id: DEFAULT_APP_FONT_ID })

  if (error && error.code !== '23505') throw error

  const after = await fetchUserAppFontId(userId)
  return after ?? DEFAULT_APP_FONT_ID
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

export async function loadAndApplyUserAppFont(userId: string): Promise<void> {
  const id = (await fetchUserAppFontId(userId)) ?? DEFAULT_APP_FONT_ID
  applyAppFontToDocument(id)
  setStoredAppFontId(id)
  await waitForAppFonts(id)
}

export async function loadAndApplyUserAppFontSafe(
  userId: string,
): Promise<void> {
  try {
    await loadAndApplyUserAppFont(userId)
  } catch {
    const fallback = getStoredAppFontId()
    applyAppFontToDocument(fallback)
    setStoredAppFontId(fallback)
  }
}

export async function saveUserAppFontChoice(
  userId: string,
  id: AppFontChoiceId,
): Promise<void> {
  applyAppFontToDocument(id)
  setStoredAppFontId(id)
  await upsertUserAppFontId(userId, id)
  await waitForAppFonts(id)
}
