import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { UserSubscriptionRow } from '../lib/subscription'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  subscription: UserSubscriptionRow | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshSubscription: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
