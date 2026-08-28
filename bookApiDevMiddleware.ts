import type { Connect } from 'vite'
import {
  fetchBookImageBytes,
  isAllowedBookImageUrl,
  lookupYes24ByIsbn,
  searchBooksCatalog,
} from './src/lib/bookCatalogServer'

function readQuery(req: Connect.IncomingMessage): string {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    return url.searchParams.get('q')?.trim() ?? ''
  } catch {
    return ''
  }
}

function readImageUrl(req: Connect.IncomingMessage): string {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    return url.searchParams.get('url')?.trim() ?? ''
  } catch {
    return ''
  }
}

function readIsbn(req: Connect.IncomingMessage): string {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    return url.searchParams.get('isbn')?.trim() ?? ''
  } catch {
    return ''
  }
}

export function bookApiDevMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    if (!path.startsWith('/api/books/')) {
      next()
      return
    }

    void (async () => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      try {
        if (path === '/api/books/search') {
          const q = readQuery(req)
          if (q.length < 2) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ hits: [] }))
            return
          }
          const kakaoKey =
            process.env.KAKAO_REST_API_KEY ??
            process.env.VITE_KAKAO_REST_API_KEY ??
            null
          const hits = await searchBooksCatalog(q, kakaoKey)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ hits }))
          return
        }

        if (path === '/api/books/image') {
          const imageUrl = readImageUrl(req)
          if (!imageUrl || !isAllowedBookImageUrl(imageUrl)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Invalid image url' }))
            return
          }
          const { bytes, contentType } = await fetchBookImageBytes(imageUrl)
          res.statusCode = 200
          res.setHeader('Content-Type', contentType)
          res.end(Buffer.from(bytes))
          return
        }

        if (path === '/api/books/yes24') {
          const isbn = readIsbn(req)
          if (!isbn) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'ISBN required' }))
            return
          }
          const result = await lookupYes24ByIsbn(isbn)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result ?? {}))
          return
        }

        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Not found' }))
      } catch (e) {
        const message =
          e instanceof Error ? e.message : '요청 처리에 실패했습니다.'
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: message }))
      }
    })()
  }
}
