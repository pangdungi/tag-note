import { supabase } from './supabase'

export const SOURCE_SPINE_BUCKET = 'source-spines'
const SIGNED_TTL_SEC = 60 * 60

const signedCache = new Map<string, { url: string; exp: number }>()

export function isRemoteSpineUrl(raw: string | null | undefined): boolean {
  const value = raw?.trim() ?? ''
  return value.startsWith('http://') || value.startsWith('https://')
}

export function isInlineSpineDataUrl(raw: string | null | undefined): boolean {
  return (raw?.trim() ?? '').startsWith('data:')
}

export function dataUrlToJpegBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('이미지 형식을 읽지 못했습니다.')
  const binary = atob(match[2]!)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/jpeg' })
}

export async function uploadSourceSpinePath(
  userId: string,
  sourceId: string,
  dataUrl: string,
): Promise<string> {
  const path = `${userId}/${sourceId}.jpg`
  const { error } = await supabase.storage
    .from(SOURCE_SPINE_BUCKET)
    .upload(path, dataUrlToJpegBlob(dataUrl), {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    })
  if (error) {
    throw new Error(
      error.message.includes('Bucket not found')
        ? '책등 저장소를 아직 만들지 않았습니다. 029 마이그레이션을 실행하세요.'
        : error.message,
    )
  }
  signedCache.delete(path)
  return path
}

export async function signSpinePath(path: string): Promise<string | null> {
  const clean = path.replace(/^\/+/, '')
  if (!clean) return null
  if (isRemoteSpineUrl(clean)) return clean
  const cached = signedCache.get(clean)
  if (cached && cached.exp > Date.now() + 30_000) return cached.url

  const { data, error } = await supabase.storage
    .from(SOURCE_SPINE_BUCKET)
    .createSignedUrl(clean, SIGNED_TTL_SEC)
  if (error || !data?.signedUrl) return null
  signedCache.set(clean, {
    url: data.signedUrl,
    exp: Date.now() + SIGNED_TTL_SEC * 1000,
  })
  return data.signedUrl
}

export async function signSpinePaths(
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(paths.map((p) => p.replace(/^\/+/, '')).filter(Boolean))]
  const missing: string[] = []
  const now = Date.now()
  for (const path of unique) {
    if (isRemoteSpineUrl(path)) {
      out.set(path, path)
      continue
    }
    const cached = signedCache.get(path)
    if (cached && cached.exp > now + 30_000) {
      out.set(path, cached.url)
    } else {
      missing.push(path)
    }
  }
  if (missing.length === 0) return out

  const { data, error } = await supabase.storage
    .from(SOURCE_SPINE_BUCKET)
    .createSignedUrls(missing, SIGNED_TTL_SEC)
  if (error || !data) return out

  for (const row of data) {
    const path = row.path?.replace(/^\/+/, '') ?? ''
    if (!path || !row.signedUrl) continue
    signedCache.set(path, {
      url: row.signedUrl,
      exp: now + SIGNED_TTL_SEC * 1000,
    })
    out.set(path, row.signedUrl)
  }
  return out
}
