import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in your project credentials.'
  )
}

// Read before the client consumes the URL: a password reset link lands with
// type=recovery in the hash. Backs up the PASSWORD_RECOVERY event, which can
// fire before the app has subscribed to auth changes.
export const recoveryLinkOpened = /type=recovery/.test(window.location.hash)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
