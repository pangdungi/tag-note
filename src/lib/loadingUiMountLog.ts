import { useEffect } from 'react'

/** 로딩 UI 마운트 훅(프로덕션에서는 동작 없음). */
export function useLoadingUiMountLog(_where: string) {
  useEffect(() => {}, [_where])
}
