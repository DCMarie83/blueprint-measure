// Audience controls shared by the Academy + Resources admin CRUD.
// `audiences` (text[]) lists the FAMILIES a row is published to — Contractors
// (fieldos) and/or Time & Pay Lite (lite). Writes are always explicit families;
// there is no 'all'. Academy rows additionally carry `admin_only` (a ROLE lane):
// when true the row is visible only to company admins, not crew members. Pass the
// `adminOnly`/`onAdminOnlyChange` pair to surface the "Admins only" toggle (academy
// forms); omit it and the toggle is hidden (resources, which have no admin_only).
export const AUDIENCE_FAMILIES = [
  { value: 'fieldos', label: 'Contractors', chip: 'C' },
  { value: 'lite', label: 'Time & Pay Lite', chip: 'L' },
]

const cbLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }
const chipStyle = {
  display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999,
  fontSize: 11, fontWeight: 600, background: 'var(--color-surface-2, #eee)',
  color: 'var(--color-text)', marginRight: 4, border: '1px solid var(--color-border)',
}

import { useTranslation } from 'react-i18next'

export function AudienceCheckboxes({ value, onChange, adminOnly, onAdminOnlyChange }) {
  const { t } = useTranslation()
  const arr = value || []
  const has = fam => arr.includes(fam)
  const everyone = has('fieldos') && has('lite')

  function toggleFamily(fam) {
    onChange(has(fam) ? arr.filter(a => a !== fam) : [...arr, fam])
  }
  function toggleEveryone() {
    onChange(everyone ? [] : ['fieldos', 'lite'])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={cbLabel}>
        <input type="checkbox" checked={has('fieldos')} onChange={() => toggleFamily('fieldos')} />
        {t('admin:audiences.contractors')}
      </label>
      <label style={cbLabel}>
        <input type="checkbox" checked={has('lite')} onChange={() => toggleFamily('lite')} />
        {t('admin:audiences.timePayLite')}
      </label>
      <label style={{ ...cbLabel, color: 'var(--color-text-muted)' }}>
        <input type="checkbox" checked={everyone} onChange={toggleEveryone} />
        {t('admin:audiences.everyone')}
      </label>

      {onAdminOnlyChange && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
          <label style={cbLabel}>
            <input type="checkbox" checked={!!adminOnly} onChange={e => onAdminOnlyChange(e.target.checked)} />
            {t('admin:audiences.adminsOnly')}
          </label>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, marginLeft: 22 }}>
            {t('admin:audiences.adminsOnlyHelp')}
          </div>
        </div>
      )}
    </div>
  )
}

export function AudienceBadges({ value, adminOnly }) {
  const { t } = useTranslation()
  const arr = value || []
  const fams = arr.includes('all')
    ? AUDIENCE_FAMILIES // legacy backfill safety only
    : AUDIENCE_FAMILIES.filter(f => arr.includes(f.value))
  if (!fams.length && !adminOnly) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  return (
    <>
      {fams.map(f => <span key={f.value} style={chipStyle}>{f.chip}</span>)}
      {adminOnly && <span style={chipStyle}>{t('admin:audiences.adminsBadge')}</span>}
    </>
  )
}
