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

async function fetchUserAppFontRawId(
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('app_font_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data?.app_font_id ?? null
}

export async function fetchUserAppFontId(
  userId: string,
): Promise<AppFontChoiceId | null> {
  const raw = await fetchUserAppFontRawId(userId)
  if (!raw) return null
  return normalizeLegacyAppFontId(raw)
}

async function persistMigratedAppFontId(
  userId: string,
  raw: string | null,
  id: AppFontChoiceId,
): Promise<void> {
  if (!raw || raw === id) return
  try {
    await upsertUserAppFontId(userId, id)
  } catch {
    /* 서버 제약이 아직 예전 글꼴만 허용하면 로컬만 적용 */
  }
}

/** 행이 없으면 삽입 후 기본 글꼴을 돌려줍니다. */
export async function ensureUserAppFontRow(
  userId: string,
): Promise<AppFontChoiceId> {
  const raw = await fetchUserAppFontRawId(userId)
  if (raw) {
    const existing = normalizeLegacyAppFontId(raw)
    await persistMigratedAppFontId(userId, raw, existing)
    return existing
  }

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
  const raw = await fetchUserAppFontRawId(userId)
  const id = raw ? normalizeLegacyAppFontId(raw) : DEFAULT_APP_FONT_ID
  applyAppFontToDocument(id)
  setStoredAppFontId(id)
  await persistMigratedAppFontId(userId, raw, id)
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
  try {
    await upsertUserAppFontId(userId, id)
  } catch {
    /* 서버 제약이 아직 예전 글꼴만 허용하면 이 기기에는 적용 */
  }
  await waitForAppFonts(id)
}
