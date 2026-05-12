import { Search } from 'lucide-react'
import FilterDropdown from '../ui/FilterDropdown'
import styles from './JobsFilterBar.module.css'

const TYPE_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
]

export default function JobsFilterBar({
  search, onSearchChange,
  statusFilter, onStatusChange, statusOptions,
  typeFilter, onTypeChange,
  ownerFilter, onOwnerChange, ownerOptions,
  clientFilter, onClientChange, clientOptions,
  onClearAll, hasActiveFilters,
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search jobs by name, address, client..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <FilterDropdown label="Status" value={statusFilter} options={statusOptions} onChange={onStatusChange} />
      <FilterDropdown label="Type" value={typeFilter} options={TYPE_OPTIONS} onChange={onTypeChange} />
      {ownerOptions.length > 1 && (
        <FilterDropdown label="Owner" value={ownerFilter} options={ownerOptions} onChange={onOwnerChange} />
      )}
      <FilterDropdown label="Client" value={clientFilter} options={clientOptions} onChange={onClientChange} />
      {hasActiveFilters && (
        <button type="button" className={styles.clearBtn} onClick={onClearAll}>Clear filters</button>
      )}
    </div>
  )
}
