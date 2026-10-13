import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { applyAppFontToDocument, waitForAppFonts } from './lib/appFont'
import {
  consumeImwebConnectResult,
  maybeRedirectImwebConnect,
} from './lib/imwebConnectBootstrap'

applyAppFontToDocument()

registerSW({ immediate: true })

if (maybeRedirectImwebConnect()) {
  // 아임웹 OAuth 시작 — 앱을 띄우지 않음
} else {
  consumeImwebConnectResult()
  void bootstrap()
}

async function bootstrap() {
  await waitForAppFonts()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
