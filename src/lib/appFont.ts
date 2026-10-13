/** 앱 글꼴 — 기본은 부크크 고딕, 페이지 뷰 본문만 명조 */

const SYSTEM_SANS = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
const SYSTEM_SERIF = `'Apple SD Gothic Neo', 'Malgun Gothic', serif`

export const APP_FONT_FAMILY = 'TagNote BookkGothic'
export const PAGE_MEMO_FONT_FAMILY = 'TagNote BookkMyungjo'

export function appFontStack(): string {
  return `'${APP_FONT_FAMILY}', ${SYSTEM_SANS}`
}

export function pageMemoFontStack(): string {
  return `'${PAGE_MEMO_FONT_FAMILY}', ${SYSTEM_SERIF}`
}

export function applyAppFontToDocument(): void {
  const root = document.documentElement
  const gothic = appFontStack()
  root.classList.add('app-font')
  root.style.setProperty('--app-font-family', gothic)
  root.style.setProperty('--spine-font-family', gothic)
  root.style.setProperty('--tag-font-family', gothic)
  root.style.setProperty('--scroll-memo-font-family', gothic)
  root.style.setProperty('--memo-font-family', gothic)
  root.style.setProperty('--page-memo-font-family', pageMemoFontStack())
}

/** @deprecated applyAppFontToDocument 사용 */
export function applyAppFontsToDocument(): void {
  applyAppFontToDocument()
}

const PRELOAD_FAMILIES = [APP_FONT_FAMILY, PAGE_MEMO_FONT_FAMILY]

/** 첫 화면 전에 글꼴 로드 — 시스템 폰트 깜빡임 완화 */
export async function waitForAppFonts(timeoutMs = 12000): Promise<void> {
  if (!document.fonts?.load) return
  const loads = PRELOAD_FAMILIES.flatMap((name) => [
    document.fonts.load(`400 16px "${name}"`).catch(() => undefined),
    document.fonts.load(`700 16px "${name}"`).catch(() => undefined),
  ])
  const ready = Promise.all(loads).then(() => document.fonts.ready)
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs)
  })
  await Promise.race([ready, timeout])
}

export function resetAppFontForSignedOut(): void {
  applyAppFontToDocument()
}
