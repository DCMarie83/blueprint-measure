// Single source of truth for "who can see this Academy/Resources row?". Imported by
// the tenant Academy/Resources pages AND the admin CRUD, so the rule can never drift
// between what a viewer actually sees and what the admin badge claims.
//
// The model has two independent axes:
//   • audiences[]  — the FAMILIES (fieldos / lite) a row is published to.
//   • admin_only   — a ROLE lane (academy_videos / academy_modules only): when true the
//                    row is the RivetPay-admin content, visible only to company admins,
//                    not crew members.
//
// Visibility = family match AND role match:
//   family: audiences includes viewerFamily
//   role:   NOT admin_only  OR  viewer is an admin
// Lite subs are single-seat owners, so they always COUNT as admin — admin_only can
// never hide anything from a Lite viewer. On the contractor path, "admin" means
// super admin or a contractor_admin user; crew (contractor_user) are gated out.
// Module tags affect GROUPING only — an active, family-visible video is always
// reachable (orphans fall back to an "Uncategorized" group).

export const TENANT_FAMILIES = ['fieldos', 'lite']

// Group key + label for content whose module/category is not visible to the viewer.
export const UNCATEGORIZED_KEY = '__uncategorized'
export const UNCATEGORIZED_LABEL = 'Uncategorized'

export function audiencesFor(row) {
  return Array.isArray(row?.audiences) ? row.audiences : []
}

// Core rule — the ONLY place this logic lives.
export function isVisible({ audiences, admin_only, viewerFamily, viewerIsAdmin }) {
  const fam = Array.isArray(audiences) ? audiences : []
  if (!fam.includes(viewerFamily)) return false        // family gate
  if (admin_only && !viewerIsAdmin) return false        // role gate
  return true
}

// Admin CRUD indicator. Returns { text, reason }: reason is set only when the row
// reaches nobody, so the CRUD can explain WHY ("Nobody (inactive)"). Wording:
// "Contractors", "Contractors (admins only)", "Lite", "Everyone", "Nobody (reason)".
export function visibilitySummary(row) {
  if (!row?.is_active) return { text: 'Nobody', reason: 'inactive' }
  const fam = audiencesFor(row)
  if (!fam.length) return { text: 'Nobody', reason: 'no audience set' }

  const hasFieldos = fam.includes('fieldos')
  const hasLite = fam.includes('lite')
  const adminOnly = !!row.admin_only

  // Both families, no role lock → the shorthand.
  if (hasFieldos && hasLite && !adminOnly) return { text: 'Everyone', reason: null }

  const parts = []
  if (hasFieldos) parts.push(adminOnly ? 'Contractors (admins only)' : 'Contractors')
  if (hasLite) parts.push('Lite')
  if (!parts.length) return { text: 'Nobody', reason: 'no tenant family' }
  return { text: parts.join(' / '), reason: null }
}
