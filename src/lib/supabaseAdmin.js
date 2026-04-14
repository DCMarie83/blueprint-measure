import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

// The admin client uses the service_role key, which bypasses Row Level Security
// and allows listing / creating auth users. It is only used by AdminPage.
// Never use this client outside of admin-only code paths.
export const adminSupabase = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null
