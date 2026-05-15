import { supabase } from './supabase'
import type { UserSubscriptionRow } from './subscription'

export async function fetchUserSubscription(
  userId: string,
): Promise<UserSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('user_id, email, subscription_status, period_start, period_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[user_subscriptions]', error)
    return null
  }
  if (!data) return null
  return data as UserSubscriptionRow
}
