import { useEffect } from 'react'

/** 전체·부분 화면 「불러오는 중…」 표시 지점 디버그용 */
export const LOADING_UI_LOG = '[태그노트/loading-ui]'

export function useLoadingUiMountLog(where: string) {
  useEffect(() => {
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    console.log(LOADING_UI_LOG, '「불러오는 중…」표시 시작', {
      where,
      t: new Date().toISOString(),
      performanceNowMs: Math.round(t0),
    })
    return () => {
      const t1 =
        typeof performance !== 'undefined' ? performance.now() : Date.now()
      console.log(LOADING_UI_LOG, '「불러오는 중…」표시 종료', {
        where,
        t: new Date().toISOString(),
        표시유지추정ms:
          typeof performance !== 'undefined'
            ? Math.round(t1 - t0)
            : undefined,
      })
    }
  }, [where])
}
