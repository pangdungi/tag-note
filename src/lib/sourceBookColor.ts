import { useEffect, useState, type CSSProperties } from 'react'
import {
  hasStoredSourceSpine,
  knownYes24SpinePresence,
  resolveSourceCoverUrl,
} from './bookCatalogServer'
import type { SourceRow } from './notesApi'

export const DEFAULT_SOURCE_BOOK_COLOR = '#eef0f3'
const SOURCE_BOOK_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export const SOURCE_BOOK_COLOR_SWATCHES = [
  '#eef0f3',
  '#111111',
  '#7f1d1d',
  '#1e3a5f',
  '#14532d',
  '#92400e',
  '#9a3412',
  '#4c1d95',
  '#0f766e',
  '#be185d',
  '#374151',
  '#d6c4a2',
] as const

export function normalizeSourceBookColor(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim() ?? ''
  if (!SOURCE_BOOK_COLOR_RE.test(value)) return null
  return value.toLowerCase()
}

function hexChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16)
}

function relativeLuminance(hex: string): number {
  const r = hexChannel(hex, 1) / 255
  const g = hexChannel(hex, 3) / 255
  const b = hexChannel(hex, 5) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function sourceBookInkColor(bg: string): string {
  return relativeLuminance(bg) > 0.55 ? '#111111' : '#f7f7f5'
}

export function sourceBookEdgeColor(bg: string): string {
  const mix = relativeLuminance(bg) > 0.55 ? 0.22 : 0.12
  const r = Math.round(hexChannel(bg, 1) * (1 - mix))
  const g = Math.round(hexChannel(bg, 3) * (1 - mix))
  const b = Math.round(hexChannel(bg, 5) * (1 - mix))
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

export function sourceBookColorStyle(bg: string): CSSProperties {
  return {
    ['--source-book-color' as string]: bg,
    ['--source-book-ink' as string]: sourceBookInkColor(bg),
    ['--source-book-edge' as string]: sourceBookEdgeColor(bg),
  }
}

export function isManualSource(source: {
  metadata_source?: string | null
  yes24_goods_no?: string | null
}): boolean {
  if (source.metadata_source?.trim() === 'manual') return true
  return !source.yes24_goods_no?.trim()
}

export function canEditSourceBookColor(
  source: {
    yes24_goods_no?: string | null
    spine_signed_url?: string | null
    spine_image_path?: string | null
    spine_image_url?: string | null
  },
  opts?: { hasLocalSpine?: boolean },
): boolean {
  if (opts?.hasLocalSpine) return false
  if (hasStoredSourceSpine(source)) return false
  const goodsNo = source.yes24_goods_no?.trim()
  if (goodsNo && knownYes24SpinePresence(goodsNo) === true) return false
  return true
}

const extractCache = new Map<string, string | null>()
const extractInflight = new Map<string, Promise<string | null>>()

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('')}`
}

export function extractYes24GoodsNo(
  raw: string | null | undefined,
): string | null {
  const fromUrl = raw?.match(/image\.yes24\.com\/goods\/(\d+)/i)
  if (fromUrl?.[1]) return fromUrl[1]
  const digits = raw?.trim() ?? ''
  return /^\d{4,12}$/.test(digits) ? digits : null
}

function coverColorSampleUrl(url: string): string {
  const goodsNo = extractYes24GoodsNo(url)
  if (goodsNo) return `https://image.yes24.com/goods/${goodsNo}/S`
  return url
}

function coverColorFallbackUrl(url: string): string | null {
  const goodsNo = extractYes24GoodsNo(url)
  if (goodsNo) return `/api/books/cover-proxy?goodsNo=${goodsNo}`
  return null
}

function dominantColorFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const buckets = new Map<number, { r: number; g: number; b: number; w: number }>()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const a = data[i + 3]
      if (a < 180) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (lum < 28 || lum > 248) continue
      if (max - min < 14 && lum > 210) continue
      const edge =
        x < width * 0.14 ||
        x > width * 0.86 ||
        y < height * 0.1 ||
        y > height * 0.9
          ? 3.2
          : 1
      const satBoost = max - min > 40 ? 1.6 : 1
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const cur = buckets.get(key)
      const w = edge * satBoost
      if (cur) {
        cur.r += r * w
        cur.g += g * w
        cur.b += b * w
        cur.w += w
      } else {
        buckets.set(key, { r: r * w, g: g * w, b: b * w, w })
      }
    }
  }
  let best: { r: number; g: number; b: number; w: number } | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.w > best.w) best = bucket
  }
  if (!best || best.w < 8) return null
  return rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w)
}

function dominantColorFromImageSource(
  source: CanvasImageSource,
  naturalW: number,
  naturalH: number,
): string | null {
  if (naturalW < 16 || naturalH < 16) return null
  const canvas = document.createElement('canvas')
  const sampleW = Math.min(48, naturalW)
  const sampleH = Math.min(64, naturalH)
  canvas.width = sampleW
  canvas.height = sampleH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, sampleW, sampleH)
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data
  return dominantColorFromPixels(data, sampleW, sampleH)
}

async function colorFromFetchedImage(sampleUrl: string): Promise<string | null> {
  const res = await fetch(sampleUrl, { referrerPolicy: 'no-referrer' })
  if (!res.ok) return null
  const blob = await res.blob()
  if (blob.size < 32) return null
  const bitmap = await createImageBitmap(blob)
  try {
    return dominantColorFromImageSource(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

async function extractCoverColor(url: string): Promise<string | null> {
  try {
    const color = await colorFromFetchedImage(coverColorSampleUrl(url))
    if (color) return color
  } catch {
    /* 예스24 직접 실패 시 프록시 */
  }
  const fallback = coverColorFallbackUrl(url)
  if (!fallback) return null
  try {
    return await colorFromFetchedImage(fallback)
  } catch {
    return null
  }
}

export function sampleCoverAverageColor(url: string): Promise<string | null> {
  const key = url.trim()
  if (!key) return Promise.resolve(null)
  if (extractCache.has(key)) return Promise.resolve(extractCache.get(key) ?? null)
  const pending = extractInflight.get(key)
  if (pending) return pending
  const next = extractCoverColor(key).then((color) => {
    extractCache.set(key, color)
    extractInflight.delete(key)
    return color
  })
  extractInflight.set(key, next)
  return next
}

export function sourceNeedsCoverColor(source: SourceRow): boolean {
  if (normalizeSourceBookColor(source.spine_color)) return false
  if (hasStoredSourceSpine(source)) return false
  return Boolean(
    resolveSourceCoverUrl(source) || source.yes24_goods_no?.trim(),
  )
}

export function resolveSourceColorSampleKey(source: SourceRow): string | null {
  return (
    resolveSourceCoverUrl(source) ||
    source.yes24_goods_no?.trim() ||
    null
  )
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await mapper(items[i])
    }
  }
  const n = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

export async function hydrateSourceBookColors(
  sources: SourceRow[],
): Promise<{ rows: SourceRow[]; changed: SourceRow[] }> {
  const changed: SourceRow[] = []
  const rows = await mapPool(sources, 8, async (source) => {
    if (!sourceNeedsCoverColor(source)) return source
    const key = resolveSourceColorSampleKey(source)
    if (!key) return source
    const color = await sampleCoverAverageColor(key)
    if (!color) return source
    const next = { ...source, spine_color: color }
    changed.push(next)
    return next
  })
  return { rows, changed }
}

export function useCoverSampleColor(coverUrl: string | null): string | null {
  const [extracted, setExtracted] = useState<string | null>(null)

  useEffect(() => {
    if (!coverUrl) {
      setExtracted(null)
      return
    }
    let cancelled = false
    void sampleCoverAverageColor(coverUrl).then((color) => {
      if (!cancelled) setExtracted(color)
    })
    return () => {
      cancelled = true
    }
  }, [coverUrl])

  return extracted
}
