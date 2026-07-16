import { createClient } from '@supabase/supabase-js'
import { processLock } from '@supabase/auth-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env and fill in your values.')
}

// processLock (in-memory) instead of the default navigator.locks lock.
// Tradeoff: cross-tab auth exclusivity is lost — two open tabs can race a
// token refresh. Accepted because WebKit's Web Locks implementation was
// breaking real signups on iOS 15 Safari (lock steal -> thrown
// NavigatorLockAcquireTimeoutError during page mount).
// All other auth options (persistSession, autoRefreshToken,
// detectSessionInUrl) keep their defaults.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { lock: processLock },
})
