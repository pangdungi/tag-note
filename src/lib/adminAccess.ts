import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const DEFAULT_APP_ADMIN_EMAIL = 'dbsgpwls416@gmail.com'

const ADMIN_UNLOCK_STORAGE_KEY = 'tag_note_admin_unlock'

export function adminUnlockKey() {
  return String(import.meta.env.VITE_ADMIN_UNLOCK_KEY || 'tagnote-admin')
    .trim()
    .replace(/^['"]|['"]$/g, '')
}

export function isAppAdminUser(user: User | null | undefined) {
  return (
    (user?.email || '').trim().toLowerCase() === DEFAULT_APP_ADMIN_EMAIL
  )
}

export function isAdminUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function unlockAdminSession() {
  try {
    sessionStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function tryUnlockAdminWithKey(input: string) {
  if (input.trim() !== adminUnlockKey()) return false
  unlockAdminSession()
  return true
}

export async function isCurrentUserAppAdmin() {
  try {
    const { data, error } = await supabase.rpc('tn_is_app_admin')
    if (!error && typeof data === 'boolean') return data
  } catch {
    /* fall through */
  }
  try {
    const { data } = await supabase.auth.getSession()
    return isAppAdminUser(data.session?.user)
  } catch {
    return false
  }
}
