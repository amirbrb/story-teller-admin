import { createClient } from '@supabase/supabase-js'

// Same Supabase project as story-teller — this app has no backend of its own, it authenticates
// against the same user pool and reads/writes through the admin RLS policies and admin_* RPCs
// added in story-teller/supabase/migrations/0012_admin.sql.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example to .env and fill in your project URL/key.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
