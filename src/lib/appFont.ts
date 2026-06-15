/** 앱 글꼴 — 스포카(본문·UI) + 도스고딕(태그·스파인)만 사용 */

export const APP_FONT_STORAGE_KEY = 'tag-note-app-font-v1'

const SYSTEM_STACK = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`

export const SPOQA_STACK = `'TagNote SpoqaHanSansNeo', ${SYSTEM_STACK}`
export const DOS_GOTHIC_STACK = `'TagNote DOSGothic', ${SYSTEM_STACK}`

/** 레거시 localStorage·DB 값 → 스포카로 정리 */
const LEGACY_FONT_IDS = new Set([
  'system',
  'leeseoyun',
  'donoun_medium',
  'adultkid',
  'pak_yong_jun',
])

export type AppFontChoiceId = 'spoqa' | 'dos_gothic'

export function isAppFontChoiceId(v: string): v is AppFontChoiceId {
  return v === 'spoqa' || v === 'dos_gothic'
}

export function normalizeLegacyAppFontId(v: string | null | undefined): AppFontChoiceId {
  if (v === 'dos_gothic') return 'dos_gothic'
  if (v === 'spoqa') return 'spoqa'
  if (v && LEGACY_FONT_IDS.has(v)) return 'spoqa'
  return 'spoqa'
}

/** 본문·입력·UI = 스포카, 태그·스파인·placeholder = 도스고딕 */
export function applyAppFontsToDocument(): void {
  const root = document.documentElement.style
  root.setProperty('--app-font-family', SPOQA_STACK)
  root.setProperty('--memo-font-family', SPOQA_STACK)
  root.setProperty('--spine-font-family', DOS_GOTHIC_STACK)
  root.setProperty('--tag-font-family', DOS_GOTHIC_STACK)
}

export function getStoredAppFontId(): AppFontChoiceId {
  try {
    const raw = localStorage.getItem(APP_FONT_STORAGE_KEY)
    return normalizeLegacyAppFontId(raw)
  } catch {
    return 'spoqa'
  }
}

export function setStoredAppFontId(id: AppFontChoiceId): void {
  try {
    localStorage.setItem(APP_FONT_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

/** @deprecated 항상 스포카·도스고딕 고정 적용 */
export function applyAppFontToDocument(_id?: AppFontChoiceId): void {
  applyAppFontsToDocument()
}

export function resetAppFontForSignedOut(): void {
  try {
    localStorage.setItem(APP_FONT_STORAGE_KEY, 'spoqa')
  } catch {
    /* ignore */
  }
  applyAppFontsToDocument()
}
