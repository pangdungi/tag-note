export type SourceSpineImageData = {
  url: string
  width: number
  height: number
}

/** 북스파인은 세로로 길고 좁음 — 원본 해상도 최대한 유지 */
const SPINE_MAX_WIDTH = 520
const SPINE_JPEG_QUALITY = 0.94

const FILE_PATH_CLIPBOARD_MESSAGE =
  '브라우저는 컴퓨터 파일 경로(file://)를 읽을 수 없습니다. 교보문고에서 북스파인을 우클릭 → 「이미지 복사」하거나, 다운로드한 jpg 파일을 끌어다 놓거나 선택하세요.'

type Bounds = {
  left: number
  top: number
  right: number
  bottom: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = src
  })
}

function firstImageFileFromTransfer(clipboard: DataTransfer): File | null {
  if (clipboard.files?.length) {
    for (const file of clipboard.files) {
      if (file.type.startsWith('image/')) return file
    }
  }

  for (const item of clipboard.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }

  return null
}

function imgSrcFromHtml(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match?.[1]?.trim() ?? null
}

function isRemoteImageUrl(src: string): boolean {
  return (
    src.startsWith('data:') ||
    src.startsWith('http://') ||
    src.startsWith('https://')
  )
}

/** 교보문고 — 흰/베이지 여백·격자 / UI 흰 패널 */
function isSpineBackgroundPixel(
  r: number,
  g: number,
  b: number,
  a: number,
): boolean {
  if (a < 12) return true
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 226 && max - min < 36
}

function columnContentCounts(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number[] {
  const counts = new Array<number>(width).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (
        !isSpineBackgroundPixel(
          pixels[i],
          pixels[i + 1],
          pixels[i + 2],
          pixels[i + 3],
        )
      ) {
        counts[x]++
      }
    }
  }
  return counts
}

/** 가로로 넓은 이미지 — 책등이 있는 세로 띠만 추출 */
function findSpineColumnBounds(
  counts: number[],
  height: number,
): { left: number; right: number } | null {
  const threshold = Math.max(4, Math.round(height * 0.012))
  let bestLeft = 0
  let bestRight = -1
  let bestScore = 0
  let runLeft = -1
  let runScore = 0

  const flush = (runRight: number) => {
    if (runLeft < 0) return
    const runWidth = runRight - runLeft + 1
    const score = runScore * Math.min(1, 0.28 / Math.max(runWidth / height, 0.05))
    if (score > bestScore) {
      bestScore = score
      bestLeft = runLeft
      bestRight = runRight
    }
  }

  for (let x = 0; x < counts.length; x++) {
    if (counts[x] >= threshold) {
      if (runLeft < 0) runLeft = x
      runScore += counts[x]
    } else if (runLeft >= 0) {
      flush(x - 1)
      runLeft = -1
      runScore = 0
    }
  }
  if (runLeft >= 0) flush(counts.length - 1)

  if (bestRight < bestLeft) return null
  return { left: bestLeft, right: bestRight }
}

function findContentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  xMin = 0,
  xMax = width - 1,
): Bounds | null {
  let top = height
  let left = width
  let bottom = 0
  let right = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const i = (y * width + x) * 4
      if (
        !isSpineBackgroundPixel(
          pixels[i],
          pixels[i + 1],
          pixels[i + 2],
          pixels[i + 3],
        )
      ) {
        found = true
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }

  if (!found) return null
  return { left, top, right, bottom }
}

function cropCanvas(
  canvas: HTMLCanvasElement,
  left: number,
  top: number,
  width: number,
  height: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const outCtx = out.getContext('2d')
  if (!outCtx) return canvas
  outCtx.drawImage(canvas, left, top, width, height, 0, 0, width, height)
  return out
}

/** 북스파인 주변 흰 여백·옆 패널 제거 */
function trimSpineWhitespace(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas

  const { width, height } = canvas
  const pixels = ctx.getImageData(0, 0, width, height).data
  const aspect = width / height

  let xMin = 0
  let xMax = width - 1

  if (aspect > 0.45) {
    const columnBounds = findSpineColumnBounds(
      columnContentCounts(pixels, width, height),
      height,
    )
    if (columnBounds) {
      xMin = columnBounds.left
      xMax = columnBounds.right
    }
  }

  const bounds = findContentBounds(pixels, width, height, xMin, xMax)
  if (!bounds) return canvas

  const pad = 2
  const cropLeft = Math.max(0, bounds.left - pad)
  const cropTop = Math.max(0, bounds.top - pad)
  const cropRight = Math.min(width - 1, bounds.right + pad)
  const cropBottom = Math.min(height - 1, bounds.bottom + pad)
  const cropW = cropRight - cropLeft + 1
  const cropH = cropBottom - cropTop + 1

  if (cropW <= 0 || cropH <= 0) return canvas
  if (cropW >= width * 0.97 && cropH >= height * 0.97) return canvas

  return cropCanvas(canvas, cropLeft, cropTop, cropW, cropH)
}

function drawScaledCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const scale =
    source.width > SPINE_MAX_WIDTH ? SPINE_MAX_WIDTH / source.width : 1
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const outputCtx = output.getContext('2d')
  if (!outputCtx) throw new Error('이미지 처리에 실패했습니다.')
  outputCtx.imageSmoothingEnabled = true
  outputCtx.imageSmoothingQuality = 'high'
  outputCtx.drawImage(source, 0, 0, width, height)
  return output
}

function canvasToSpineData(
  canvas: HTMLCanvasElement,
  fallbackUrl?: string,
): SourceSpineImageData {
  const width = canvas.width
  const height = canvas.height

  try {
    const url = canvas.toDataURL('image/jpeg', SPINE_JPEG_QUALITY)
    return { url, width, height }
  } catch {
    if (fallbackUrl?.startsWith('http')) {
      return { url: fallbackUrl, width, height }
    }
    throw new Error('이미지 처리에 실패했습니다.')
  }
}

/** 북스파인 표시용 — 여백 제거, 고화질 리사이즈 */
export async function compressSourceSpineImage(
  dataUrl: string,
): Promise<SourceSpineImageData> {
  const img = await loadImage(dataUrl)

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = img.width
  sourceCanvas.height = img.height
  const sourceCtx = sourceCanvas.getContext('2d')
  if (!sourceCtx) throw new Error('이미지 처리에 실패했습니다.')
  sourceCtx.imageSmoothingEnabled = true
  sourceCtx.imageSmoothingQuality = 'high'
  sourceCtx.drawImage(img, 0, 0)

  const trimmed = trimSpineWhitespace(sourceCanvas)
  const output = drawScaledCanvas(trimmed)
  return canvasToSpineData(output, dataUrl)
}

export async function readClipboardSpineImage(
  clipboard: DataTransfer | null,
): Promise<SourceSpineImageData | null> {
  if (!clipboard) return null

  const file = firstImageFileFromTransfer(clipboard)
  if (file) return fileToSpineImage(file)

  const html = clipboard.getData('text/html')
  if (html) {
    const src = imgSrcFromHtml(html)
    if (src?.startsWith('file:')) {
      throw new Error(FILE_PATH_CLIPBOARD_MESSAGE)
    }
    if (src && isRemoteImageUrl(src)) {
      return compressSourceSpineImage(src)
    }
  }

  const plain = clipboard.getData('text/plain')?.trim()
  if (plain) {
    if (plain.startsWith('file:')) {
      throw new Error(FILE_PATH_CLIPBOARD_MESSAGE)
    }
    if (isRemoteImageUrl(plain)) {
      return compressSourceSpineImage(plain)
    }
  }

  return null
}

export async function fileToSpineImage(file: File): Promise<SourceSpineImageData> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 사용할 수 있습니다.')
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('이미지를 읽지 못했습니다.'))
    }
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
  return compressSourceSpineImage(dataUrl)
}

import { resolveSourceSpineUrl } from './bookCatalogServer'

export function hasSourceSpineImage(source: {
  spine_image_url?: string | null
  yes24_goods_no?: string | null
}): boolean {
  return Boolean(resolveSourceSpineUrl(source))
}

function spineFontFamily(): string {
  if (typeof document === 'undefined') {
    return `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
  }
  const stack = getComputedStyle(document.documentElement)
    .getPropertyValue('--spine-font-family')
    .trim()
  return stack || `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
}

function averageRgb(
  pixels: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  sampleW: number,
  sampleH: number,
): [number, number, number] {
  const xStart = Math.max(0, Math.floor(x0))
  const yStart = Math.max(0, Math.floor(y0))
  const xEnd = Math.min(width - 1, Math.floor(x0 + sampleW))
  const yEnd = Math.min(
    pixels.length / (width * 4) - 1,
    Math.floor(y0 + sampleH),
  )
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const i = (y * width + x) * 4
      const a = pixels[i + 3]
      if (a < 20) continue
      r += pixels[i]
      g += pixels[i + 1]
      b += pixels[i + 2]
      count++
    }
  }
  if (count === 0) return [120, 120, 120]
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
}

function rgbToCss([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function rgbLuminance([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function cleanSpineTitle(title: string): string {
  return title
    .replace(/[()（）<>〈〉]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fitVerticalTitleFontSize(
  ctx: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
): number {
  let size = Math.min(22, Math.max(11, Math.round(maxWidth * 0.42)))
  while (size >= 10) {
    ctx.font = `600 ${size}px ${fontFamily}`
    const metrics = ctx.measureText(title)
    if (metrics.width <= maxHeight) return size
    size -= 1
  }
  return 10
}

/**
 * 교보문고 cardnews(북스파인)가 없을 때 — 표지 색·제목으로 세로 북스파인 합성.
 * 진짜 북스파인 대체이며, 나중에 붙여넣기로 교체 가능.
 */
export async function synthesizeSpineFromCover(
  coverSrc: string,
  title: string,
): Promise<SourceSpineImageData> {
  const img = await loadImage(coverSrc)
  const label = cleanSpineTitle(title)
  if (!label) {
    throw new Error('제목이 없어 북스파인을 만들 수 없습니다.')
  }

  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = img.width
  sampleCanvas.height = img.height
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
  if (!sampleCtx) throw new Error('이미지 처리에 실패했습니다.')
  sampleCtx.drawImage(img, 0, 0)
  const pixels = sampleCtx.getImageData(0, 0, img.width, img.height).data

  const stripW = Math.max(4, Math.round(img.width * 0.07))
  const left = averageRgb(pixels, img.width, 0, 0, stripW, img.height)
  const right = averageRgb(
    pixels,
    img.width,
    img.width - stripW,
    0,
    stripW,
    img.height,
  )
  const center = averageRgb(
    pixels,
    img.width,
    img.width * 0.35,
    img.height * 0.2,
    img.width * 0.3,
    img.height * 0.6,
  )

  const spineHeight = img.height
  const spineWidth = Math.max(
    52,
    Math.min(SPINE_MAX_WIDTH, Math.round(spineHeight / 6.8)),
  )

  const canvas = document.createElement('canvas')
  canvas.width = spineWidth
  canvas.height = spineHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지 처리에 실패했습니다.')

  const grad = ctx.createLinearGradient(0, 0, spineWidth, 0)
  grad.addColorStop(0, rgbToCss(mixRgb(left, center, 0.25)))
  grad.addColorStop(0.45, rgbToCss(center))
  grad.addColorStop(1, rgbToCss(mixRgb(right, center, 0.25)))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, spineWidth, spineHeight)

  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.drawImage(
    img,
    img.width * 0.42,
    0,
    img.width * 0.16,
    img.height,
    0,
    0,
    spineWidth,
    spineHeight,
  )
  ctx.restore()

  const edge = mixRgb(left, right, 0.5)
  ctx.strokeStyle = `rgba(0, 0, 0, ${rgbLuminance(edge) > 180 ? 0.08 : 0.14})`
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, spineWidth - 1, spineHeight - 1)

  const fontFamily = spineFontFamily()
  const padX = Math.max(6, Math.round(spineWidth * 0.14))
  const padY = Math.max(10, Math.round(spineHeight * 0.05))
  const textAreaHeight = spineHeight - padY * 2
  const fontSize = fitVerticalTitleFontSize(
    ctx,
    label,
    spineWidth - padX * 2,
    textAreaHeight,
    fontFamily,
  )
  ctx.font = `600 ${fontSize}px ${fontFamily}`
  ctx.fillStyle = rgbLuminance(center) > 168 ? '#1f2937' : '#f8fafc'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.save()
  ctx.translate(spineWidth - padX, padY)
  ctx.rotate(Math.PI / 2)
  ctx.fillText(label, 0, 0)
  ctx.restore()

  return canvasToSpineData(canvas)
}
