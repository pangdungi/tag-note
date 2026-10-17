import { supabase } from './supabase'

export type AdminSubscriptionRow = {
  user_id: string
  email: string | null
  subscription_status: string
  period_start: string
  period_end: string
  signup_at: string | null
  access_until: string | null
}

export type AdminImwebGrantRow = {
  order_no: number
  orderer_email: string
  prod_no: number
  user_id: string | null
  grant_status: string | null
  grant_applied_at: string | null
  access_until_after: string | null
  created_at: string
}

export type AdminDeletionRow = {
  id: number
  user_id: string
  email: string
  deleted_at: string
}

function asError(error: { message?: string } | null) {
  return error?.message || '요청에 실패했습니다.'
}

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (!data) return null
  return Array.isArray(data) ? (data[0] ?? null) : data
}

export async function adminListSubscriptions() {
  const { data, error } = await supabase.rpc('tn_admin_list_subscriptions')
  if (error) return { ok: false as const, error: asError(error), data: null }
  return { ok: true as const, error: null, data: (data || []) as AdminSubscriptionRow[] }
}

export async function adminGrantOneYear(userId: string) {
  const { data, error } = await supabase.rpc('tn_admin_grant_one_year', {
    p_user_id: userId,
  })
  if (error) return { ok: false as const, error: asError(error), data: null }
  return {
    ok: true as const,
    error: null,
    data: firstRow(data as AdminSubscriptionRow | AdminSubscriptionRow[]),
  }
}

export async function adminSetSubscription(
  userId: string,
  status: string,
  accessUntilIso: string,
) {
  const { data, error } = await supabase.rpc('tn_admin_set_subscription', {
    p_user_id: userId,
    p_subscription_status: status,
    p_access_until: accessUntilIso,
  })
  if (error) return { ok: false as const, error: asError(error), data: null }
  return {
    ok: true as const,
    error: null,
    data: firstRow(data as AdminSubscriptionRow | AdminSubscriptionRow[]),
  }
}

export async function adminListUserDeletions() {
  const { data, error } = await supabase.rpc('tn_admin_list_user_deletions')
  if (error) return { ok: false as const, error: asError(error), data: null }
  return { ok: true as const, error: null, data: (data || []) as AdminDeletionRow[] }
}

export async function adminListImwebOrderGrants() {
  const { data, error } = await supabase.rpc('tn_admin_list_imweb_order_grants')
  if (error) return { ok: false as const, error: asError(error), data: null }
  return { ok: true as const, error: null, data: (data || []) as AdminImwebGrantRow[] }
}
