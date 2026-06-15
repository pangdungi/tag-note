/** index.html 부트 스플래시 — React 로딩 UI가 뜨면 제거 */
export function hideAppBootSplash(): void {
  const el = document.getElementById('app-boot-splash')
  if (!el) return
  el.classList.add('app-boot-splash--hide')
  window.setTimeout(() => {
    el.remove()
  }, 280)
}
