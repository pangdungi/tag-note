/** 앱 글꼴 — 계정 설정 + localStorage 캐시 */

export const APP_FONT_STORAGE_KEY = 'tag-note-app-font-v1'

const SYSTEM_STACK = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`

export const APP_FONT_CHOICES = [
  {
    id: 'griun_fromsol',
    label: '그리운 프롬솔',
    cssFamily: 'TagNote Griun Fromsol',
  },
  {
    id: 'leeseoyun',
    label: '이서윤체',
    cssFamily: 'TagNote LeeSeoyun',
  },
] as const

export type AppFontChoiceId = (typeof APP_FONT_CHOICES)[number]['id']

export const DEFAULT_APP_FONT_ID: AppFontChoiceId = 'griun_fromsol'

const FONT_ID_SET = new Set<string>(APP_FONT_CHOICES.map((c) => c.id))

const LEGACY_FONT_IDS = new Set([
  'system',
  'donoun_medium',
  'adultkid',
  'pak_yong_jun',
  'ongeulip_ryuttung',
  'spoqa',
  'dos_gothic',
  'bookk_gothic_bold',
  'griun_myeonheullim',
  'ongeulip_gongbujalhajana',
  'ongeulip_ryuryu',
  'griun_mongtori',
  'griun_cherry1spoon',
  'griun_cocochoitoon',
])

export function isAppFontChoiceId(v: string): v is AppFontChoiceId {
  return FONT_ID_SET.has(v)
}

export function normalizeLegacyAppFontId(
  v: string | null | undefined,
): AppFontChoiceId {
  if (v && LEGACY_FONT_IDS.has(v)) return DEFAULT_APP_FONT_ID
  if (v && isAppFontChoiceId(v)) return v
  return DEFAULT_APP_FONT_ID
}

export function appFontChoiceById(id: AppFontChoiceId) {
  return APP_FONT_CHOICES.find((c) => c.id === id) ?? APP_FONT_CHOICES[0]
}

export function appFontStack(id: AppFontChoiceId): string {
  const family = appFontChoiceById(id).cssFamily
  return `'${family}', ${SYSTEM_STACK}`
}

export function applyAppFontToDocument(id: AppFontChoiceId = DEFAULT_APP_FONT_ID): void {
  const stack = appFontStack(id)
  const root = document.documentElement
  root.classList.add('app-font')
  root.style.setProperty('--app-font-family', stack)
  root.style.setProperty('--memo-font-family', stack)
  root.style.setProperty('--spine-font-family', stack)
  root.style.setProperty('--tag-font-family', stack)
}

/** @deprecated applyAppFontToDocument 사용 */
export function applyAppFontsToDocument(): void {
  applyAppFontToDocument(getStoredAppFontId())
}

const ALL_FONT_FAMILIES = APP_FONT_CHOICES.map((c) => c.cssFamily)

/** 첫 화면 전에 글꼴 로드 — 시스템 폰트 깜빡임 완화 */
export async function waitForAppFonts(
  id: AppFontChoiceId = getStoredAppFontId(),
  timeoutMs = 12000,
): Promise<void> {
  if (!document.fonts?.load) return
  const family = appFontChoiceById(id).cssFamily
  const loads = [
    document.fonts.load(`16px "${family}"`).catch(() => undefined),
    ...ALL_FONT_FAMILIES.map((name) =>
      document.fonts.load(`16px "${name}"`).catch(() => undefined),
    ),
  ]
  const ready = Promise.all(loads).then(() => document.fonts.ready)
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs)
  })
  await Promise.race([ready, timeout])
}

export function getStoredAppFontId(): AppFontChoiceId {
  try {
    const raw = localStorage.getItem(APP_FONT_STORAGE_KEY)
    const id = normalizeLegacyAppFontId(raw)
    if (raw && raw !== id) setStoredAppFontId(id)
    return id
  } catch {
    return DEFAULT_APP_FONT_ID
  }
}

export function setStoredAppFontId(id: AppFontChoiceId): void {
  try {
    localStorage.setItem(APP_FONT_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function resetAppFontForSignedOut(): void {
  setStoredAppFontId(DEFAULT_APP_FONT_ID)
  applyAppFontToDocument(DEFAULT_APP_FONT_ID)
}
