import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[태그노트] .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정하세요.',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
