import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import FilterDropdown from '../ui/FilterDropdown'
import styles from './JobsFilterBar.module.css'

const TYPE_OPTIONS = [
  { value: 'residential', label: 'common:jobType.residential' },
  { value: 'commercial', label: 'common:jobType.commercial' },
]

export default function JobsFilterBar({
  search, onSearchChange,
  statusFilter, onStatusChange, statusOptions,
  typeFilter, onTypeChange,
  ownerFilter, onOwnerChange, ownerOptions,
  clientFilter, onClientChange, clientOptions,
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
      {hasActiveFilters && (
        <button type="button" className={styles.clearBtn} onClick={onClearAll}>{t('jobs:filterBar.clearFilters')}</button>
      )}
    </div>
  )
}
