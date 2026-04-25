import { supabase } from '../lib/supabase'

// In-memory cache: { [key]: { data, expiresAt } }
const cache = {}
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Returns { totalBytes, fileCount } for all files in the blueprints bucket
// belonging to the given tenant's users.
export async function getCompanyStorageUsage(tenantId) {
  const cacheKey = `company_${tenantId}`
  const cached = cache[cacheKey]
  if (cached && cached.expiresAt > Date.now()) return cached.data

  // Find all user IDs belonging to this company
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('company_id', tenantId)

  const userIds = (profiles ?? []).map(p => p.user_id)
  let totalBytes = 0
  let fileCount = 0

  for (const userId of userIds) {
    const usage = await getUserStorageUsage(userId)
    totalBytes += usage.totalBytes
    fileCount += usage.fileCount
  }

  const result = { totalBytes, fileCount }
  cache[cacheKey] = { data: result, expiresAt: Date.now() + CACHE_TTL_MS }
  return result
}

// Returns { totalBytes, fileCount } for all files uploaded by a specific user
// in the blueprints bucket (files stored under userId/ prefix).
export async function getUserStorageUsage(userId) {
  const cacheKey = `user_${userId}`
  const cached = cache[cacheKey]
  if (cached && cached.expiresAt > Date.now()) return cached.data

  let totalBytes = 0
  let fileCount = 0

  try {
    // List top-level folders (session IDs) under the user's directory
    const { data: folders } = await supabase.storage
      .from('blueprints')
      .list(userId, { limit: 1000 })

    if (folders) {
      for (const folder of folders) {
        // Each folder is a session; list files inside
        const { data: files } = await supabase.storage
          .from('blueprints')
          .list(`${userId}/${folder.name}`, { limit: 1000 })
        if (files) {
          for (const f of files) {
            totalBytes += f.metadata?.size ?? 0
            fileCount++
          }
        }
      }
    }
  } catch {
    // Silently return zero if storage listing fails
  }

  const result = { totalBytes, fileCount }
  cache[cacheKey] = { data: result, expiresAt: Date.now() + CACHE_TTL_MS }
  return result
}
