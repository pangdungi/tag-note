import { useEffect } from 'react'
import splashArtUrl from '../assets/splash-screen.png'
import { hideAppBootSplash } from '../lib/appBootSplash'
import { useLoadingUiMountLog } from '../lib/loadingUiMountLog'

type AppSplashScreenProps = {
  message?: string
  where?: string
}

export function AppSplashScreen({
  message = '잠시만 기다려 주세요…',
  where = 'AppSplashScreen',
}: AppSplashScreenProps) {
  useLoadingUiMountLog(where)

  useEffect(() => {
    hideAppBootSplash()
  }, [])

  return (
    <div className="app-splash-screen" role="status" aria-live="polite">
      <img
        className="app-splash-screen__art"
        src={splashArtUrl}
        alt=""
        width={320}
        height={400}
        decoding="async"
      />
      <p className="app-splash-screen__message">{message}</p>
      <div className="app-splash-screen__progress" aria-hidden="true">
        <span className="app-splash-screen__progress-bar" />
      </div>
    </div>
  )
}
