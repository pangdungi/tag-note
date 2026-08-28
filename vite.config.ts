import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { bookApiDevMiddleware } from './bookApiDevMiddleware'
import { configureYes24ApiKey } from './src/lib/bookCatalogServer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  configureYes24ApiKey(env.YES24_API_KEY ?? env.VITE_YES24_API_KEY)

  return {
  plugins: [
    {
      name: 'book-api-dev',
      enforce: 'pre',
      configureServer(server) {
        const handler = bookApiDevMiddleware()
        server.middlewares.use((req, res, next) => {
          const path = (req.url ?? '').split('?')[0]
          if (path.startsWith('/api/books/')) {
            handler(req, res, next)
            return
          }
          next()
        })
        const stack = server.middlewares.stack
        const layer = stack.pop()
        if (layer) stack.unshift(layer)
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: '두들노트',
        short_name: '두들노트',
        description: '태그로 정리하는 메모',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        lang: 'ko',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/fonts/**'],
      },
    }),
  ],
  }
})
