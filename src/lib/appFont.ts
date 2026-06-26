/** 앱 글꼴 — 그리운묘은흘림체(본문·UI·태그·스파인) */

export const APP_FONT_STORAGE_KEY = 'tag-note-app-font-v1'

const SYSTEM_STACK = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`

export const BODY_FONT_FAMILY = 'TagNote GriunMyoenHeullim'
export const BODY_FONT_STACK = `'${BODY_FONT_FAMILY}', ${SYSTEM_STACK}`

/** 레거시 localStorage·DB 값 → 본문 글꼴(spoqa id)로 정리 */
const LEGACY_FONT_IDS = new Set([
  'system',
  'leeseoyun',
  'donoun_medium',
  'adultkid',
  'pak_yong_jun',
  'dos_gothic',
])

export type AppFontChoiceId = 'spoqa' | 'dos_gothic'

export function isAppFontChoiceId(v: string): v is AppFontChoiceId {
  return v === 'spoqa' || v === 'dos_gothic'
}

export function normalizeLegacyAppFontId(v: string | null | undefined): AppFontChoiceId {
  if (v === 'dos_gothic') return 'spoqa'
  if (v === 'spoqa') return 'spoqa'
  if (v && LEGACY_FONT_IDS.has(v)) return 'spoqa'
  return 'spoqa'
}

/** 본문·입력·UI·태그·스파인·placeholder = 그리운묘은흘림체 */
export function applyAppFontsToDocument(): void {
  const root = document.documentElement.style
  root.setProperty('--app-font-family', BODY_FONT_STACK)
  root.setProperty('--memo-font-family', BODY_FONT_STACK)
  root.setProperty('--spine-font-family', BODY_FONT_STACK)
  root.setProperty('--tag-font-family', BODY_FONT_STACK)
}

const APP_FONT_FACES = [BODY_FONT_FAMILY] as const

/** 첫 화면 전에 본문 글꼴 로드 — 시스템 폰트 깜빡임 방지 */
export async function waitForAppFonts(timeoutMs = 12000): Promise<void> {
  if (!document.fonts?.load) return
  const loads = APP_FONT_FACES.map((family) =>
    document.fonts.load(`16px "${family}"`).catch(() => undefined),
  )
  const ready = Promise.all(loads).then(() => document.fonts.ready)
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs)
  })
  await Promise.race([ready, timeout])
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

/** @deprecated 항상 그리운묘은흘림체 고정 적용 */
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
