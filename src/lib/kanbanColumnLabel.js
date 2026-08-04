// Single source of truth for rendering a kanban column's display label.
//
// Platform-seeded (is_base) columns carry a stable `column_key`
// ('measurements_estimates', 'accepted', ...) which resolves to a translated
// label under jobs:kanbanColumn.*. Tenant-renamed / custom columns have a null
// key and render their raw `name` verbatim (never translated). The i18n
// defaultValue also falls back to `name` if a key ever lacks a translation.
export function resolveColumnLabel(t, col) {
  if (!col) return ''
  return col.column_key
    ? t('jobs:kanbanColumn.' + col.column_key, { defaultValue: col.name })
    : col.name
}

// Same key-or-name logic for the portal shape, where get_portal_project returns
// status_key (the column_key, possibly null) and status_label (the raw name).
export function resolvePortalStatus(t, statusKey, statusLabel) {
  return statusKey
    ? t('jobs:kanbanColumn.' + statusKey, { defaultValue: statusLabel })
    : statusLabel
}
