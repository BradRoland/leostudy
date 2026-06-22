import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const browserStorage = (() => {
  if (typeof window === 'undefined') return undefined
  const candidates = [window.localStorage, window.sessionStorage]
  for (const storage of candidates) {
    try {
      const testKey = '__leo_study_storage_test__'
      storage.setItem(testKey, '1')
      storage.removeItem(testKey)
      return storage
    } catch {
      // Try the next browser-backed storage option.
    }
  }
  return undefined
})()

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        ...(browserStorage ? { storage: browserStorage } : {}),
      },
    })
  : null
