import { supabase } from './supabase'

/** 서버 RPC: 본인 auth.users 삭제(연관 DB·식별 정보 CASCADE). */
export async function deleteOwnAccount(): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('delete_own_account')
  return { error: error ? new Error(error.message) : null }
}
