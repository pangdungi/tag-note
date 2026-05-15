/** UI 글꼴 선택 (localStorage + :root CSS 변수). */

export const APP_FONT_STORAGE_KEY = 'tag-note-app-font-v1'

export type AppFontChoiceId =
  | 'system'
  | 'leeseoyun'
  | 'ongeulip_ryuttung'
  | 'adultkid'
  | 'pak_yong_jun'

export type AppFontOption = {
  id: AppFontChoiceId
  label: string
  /** `font-family` 값 */
  cssStack: string
}

const SYSTEM_STACK = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`

export const APP_FONT_OPTIONS: AppFontOption[] = [
  {
    id: 'system',
    label: '시스템 기본 (Apple)',
    cssStack: SYSTEM_STACK,
  },
  {
    id: 'leeseoyun',
    label: '이서윤체',
    cssStack: `'TagNote LeeSeoyun', ${SYSTEM_STACK}`,
  },
  {
    id: 'ongeulip_ryuttung',
    label: '온글잎 류뚱체',
    cssStack: `'TagNote OngeulipRyuttung', ${SYSTEM_STACK}`,
  },
  {
    id: 'adultkid',
    label: '어른아이 (Adultkid)',
    cssStack: `'TagNote Adultkid', ${SYSTEM_STACK}`,
  },
  {
    id: 'pak_yong_jun',
    label: '박용준 손글씨',
    cssStack: `'TagNote PakYongJun', ${SYSTEM_STACK}`,
  },
]

const DEFAULT_ID: AppFontChoiceId = 'system'

const VALID_IDS = new Set(APP_FONT_OPTIONS.map((o) => o.id))

export function isAppFontChoiceId(v: string): v is AppFontChoiceId {
  return VALID_IDS.has(v as AppFontChoiceId)
}

export function getStoredAppFontId(): AppFontChoiceId {
  try {
    const raw = localStorage.getItem(APP_FONT_STORAGE_KEY)
    if (raw && isAppFontChoiceId(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_ID
}

export function setStoredAppFontId(id: AppFontChoiceId): void {
  try {
    localStorage.setItem(APP_FONT_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function getAppFontCssStack(id: AppFontChoiceId): string {
  return APP_FONT_OPTIONS.find((o) => o.id === id)?.cssStack ?? SYSTEM_STACK
}

/** `:root`의 `--app-font-family`를 갱신해 앱 전체 기본 글꼴을 바꿉니다. */
export function applyAppFontToDocument(id: AppFontChoiceId): void {
  document.documentElement.style.setProperty(
    '--app-font-family',
    getAppFontCssStack(id),
  )
}

/** 로그아웃 후 로그인 화면 등: 로컬 캐시를 시스템 글꼴로 맞춤 */
export function resetAppFontForSignedOut(): void {
  try {
    localStorage.setItem(APP_FONT_STORAGE_KEY, DEFAULT_ID)
  } catch {
    /* ignore */
  }
  applyAppFontToDocument(DEFAULT_ID)
}
