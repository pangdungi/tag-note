import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { applyAppFontsToDocument, waitForAppFonts } from './lib/appFont'

applyAppFontsToDocument()

registerSW({ immediate: true })

async function bootstrap() {
  await waitForAppFonts()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
