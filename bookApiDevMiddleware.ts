import type { Connect } from 'vite'
import {
  fetchYes24BookPhysicalSize,
  searchYes24Books,
} from './src/lib/bookCatalogServer'

function requestUrl(req: Connect.IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost')
}

function readQuery(req: Connect.IncomingMessage): string {
  try {
    return requestUrl(req).searchParams.get('q')?.trim() ?? ''
  } catch {
    return ''
  }
}

export function bookApiDevMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    if (
      path !== '/api/books/search' &&
      path !== '/api/books/size' &&
      path !== '/api/books/cover-proxy'
    ) {
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
        if (path === '/api/books/cover-proxy') {
          const goodsNo = requestUrl(req).searchParams.get('goodsNo')?.trim() ?? ''
          if (!/^\d{4,12}$/.test(goodsNo)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'goodsNo가 필요합니다.' }))
            return
          }
          const headers = {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer: 'https://www.yes24.com/',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          }
          let upstream = await fetch(
            `https://image.yes24.com/goods/${goodsNo}/S`,
            { headers },
          )
          if (!upstream.ok) {
            upstream = await fetch(
              `https://image.yes24.com/goods/${goodsNo}/M`,
              { headers },
            )
          }
          if (!upstream.ok) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: '표지를 불러오지 못했습니다.' }))
            return
          }
          const type = upstream.headers.get('content-type') ?? 'image/jpeg'
          const bytes = Buffer.from(await upstream.arrayBuffer())
          res.statusCode = 200
          res.setHeader('Content-Type', type)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(bytes)
          return
        }

        if (path === '/api/books/size') {
          const url = requestUrl(req)
          const size = await fetchYes24BookPhysicalSize({
            goodsNo: url.searchParams.get('goodsNo') ?? '',
            isbn: url.searchParams.get('isbn') ?? '',
          })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ size }))
          return
        }

        const q = readQuery(req)
        if (q.length < 2) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ hits: [] }))
          return
        }
        const hits = await searchYes24Books(q)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ hits }))
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
