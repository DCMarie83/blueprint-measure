// Multi-audience controls shared by the Academy + Resources admin CRUD.
// `audiences` is a text[] on academy_videos / academy_modules / resources listing
// exactly who sees a row. New writes are always explicit families — never the
// legacy 'all'. Internal (admin) is exclusive: admin content is internal-only, so
// mixing it with a tenant family is an authoring mistake — checking it clears and
// locks the tenant boxes. The "Everyone" convenience toggle checks Contractors +
// Lite together (it never writes 'all').
export const AUDIENCE_FAMILIES = [
  { value: 'fieldos', label: 'Contractors', chip: 'C' },
  { value: 'lite', label: 'Time & Pay Lite', chip: 'L' },
  { value: 'admin', label: 'Internal only', chip: 'Internal' },
]

const cbLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }
const chipStyle = {
  display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999,
  fontSize: 11, fontWeight: 600, background: 'var(--color-surface-2, #eee)',
  color: 'var(--color-text)', marginRight: 4, border: '1px solid var(--color-border)',
}

export function AudienceCheckboxes({ value, onChange }) {
  const arr = value || []
  const has = fam => arr.includes(fam)
  const internal = has('admin')
  const everyone = has('fieldos') && has('lite') && !internal

  function toggleFamily(fam) {
    if (internal) return // tenant boxes locked while Internal is checked
    onChange(has(fam) ? arr.filter(a => a !== fam) : [...arr, fam])
  }
  function toggleInternal() {
    onChange(internal ? [] : ['admin'])
  }
  function toggleEveryone() {
    onChange(everyone ? [] : ['fieldos', 'lite'])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={cbLabel}>
        <input type="checkbox" checked={has('fieldos')} disabled={internal} onChange={() => toggleFamily('fieldos')} />
        Contractors
      </label>
      <label style={cbLabel}>
        <input type="checkbox" checked={has('lite')} disabled={internal} onChange={() => toggleFamily('lite')} />
        Time &amp; Pay Lite
      </label>
      <label style={cbLabel}>
        <input type="checkbox" checked={internal} onChange={toggleInternal} />
        Internal only
      </label>
      <label style={{ ...cbLabel, color: 'var(--color-text-muted)' }}>
        <input type="checkbox" checked={everyone} disabled={internal} onChange={toggleEveryone} />
        Everyone (Contractors + Lite)
      </label>
    </div>
  )
}

export function AudienceBadges({ value }) {
  const arr = value || []
  if (arr.includes('all')) return <span style={chipStyle}>Everyone</span> // legacy backfill only
  const fams = AUDIENCE_FAMILIES.filter(f => arr.includes(f.value))
  if (!fams.length) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  return <>{fams.map(f => <span key={f.value} style={chipStyle}>{f.chip}</span>)}</>
}
