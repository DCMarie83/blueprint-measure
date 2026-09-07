import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import FilterDropdown from '../ui/FilterDropdown'
import styles from './JobsFilterBar.module.css'

const TYPE_OPTIONS = [
  { value: 'residential', label: 'common:jobType.residential' },
  { value: 'commercial', label: 'common:jobType.commercial' },
]

const WINDOW_OPTIONS = [
  { value: '30', label: 'jobs:window.days30' },
  { value: '90', label: 'jobs:window.days90' },
  { value: '180', label: 'jobs:window.days180' },
  { value: 'all', label: 'jobs:window.all' },
  { value: 'custom', label: 'jobs:window.custom' },
]

export default function JobsFilterBar({
  search, onSearchChange,
  statusFilter, onStatusChange, statusOptions,
  typeFilter, onTypeChange,
  ownerFilter, onOwnerChange, ownerOptions,
  clientFilter, onClientChange, clientOptions,
  windowChoice, onWindowChange, customFrom, customTo, onCustomFromChange, onCustomToChange,
  onClearAll, hasActiveFilters,
}) {
  const { t } = useTranslation()
  const typeOptions = TYPE_OPTIONS.map(o => ({ ...o, label: t(o.label) }))
  return (
    <div className={styles.bar}>
      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('jobs:filterBar.searchPlaceholder')}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <FilterDropdown label={t('jobs:filterBar.status')} value={statusFilter} options={statusOptions} onChange={onStatusChange} />
      <FilterDropdown label={t('jobs:filterBar.type')} value={typeFilter} options={typeOptions} onChange={onTypeChange} />
      {ownerOptions.length > 1 && (
        <FilterDropdown label={t('jobs:filterBar.owner')} value={ownerFilter} options={ownerOptions} onChange={onOwnerChange} />
      )}
      <FilterDropdown label={t('jobs:filterBar.client')} value={clientFilter} options={clientOptions} onChange={onClientChange} />
      {windowChoice !== undefined && (
        <>
          <FilterDropdown
            label={t('jobs:window.label')}
            value={windowChoice}
            options={WINDOW_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }))}
            onChange={onWindowChange}
          />
          {windowChoice === 'custom' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={customFrom || ''} onChange={e => onCustomFromChange(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
              <input type="date" value={customTo || ''} onChange={e => onCustomToChange(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
            </span>
          )}
        </>
      )}
      {hasActiveFilters && (
        <button type="button" className={styles.clearBtn} onClick={onClearAll}>{t('jobs:filterBar.clearFilters')}</button>
      )}
    </div>
  )
}
