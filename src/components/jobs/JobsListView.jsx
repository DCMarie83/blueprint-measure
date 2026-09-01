import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useClients } from '../../hooks/useClients'
import { resolveColumnLabel } from '../../lib/kanbanColumnLabel'
import { timeAgo } from '../../utils/timeAgo'
import styles from './JobsListView.module.css'

export const DOT_COLORS = [
  'var(--color-primary)',
  '#10b981',
  '#60a5fa',
  '#a78bfa',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
]

function fmtMoneyCompact(v) {
  const n = Number(v) || 0
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function JobsListView({ projects, columns, onClickProject, moneyMap = null }) {
  const { t } = useTranslation()
  const { clients } = useClients()

  const colMap = Object.fromEntries((columns ?? []).map(c => [c.id, c]))

  const sorted = [...(projects ?? [])].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  if (sorted.length === 0) return null

  return (
    <div className={styles.list}>
      {sorted.map(project => {
        const col = colMap[project.kanban_column_id]
        const colName = col ? resolveColumnLabel(t, col) : '—'
        const colPos = col?.position ?? 0
        const dotColor = DOT_COLORS[(colPos - 1) % DOT_COLORS.length]

        const linkedClient = project.client_id ? clients.find(c => c.id === project.client_id) : null
        const clientLabel = linkedClient?.display_name || project.client_name || null

        const money = moneyMap?.get(project.id)
        const currentValue = (Number(project.contract_value) || 0) + (money?.approvedCO || 0)
        const hasMoney = currentValue !== 0 || (money?.billed || 0) !== 0 || (money?.collected || 0) !== 0 || (money?.openCoCount || 0) > 0

        return (
          <div key={project.id} className={styles.row} onClick={() => onClickProject(project.id)}>
            <span className={styles.dot} style={{ background: dotColor }} />
            <div className={styles.identity}>
              <h3 className={styles.name}>{project.name}</h3>
              <span className={styles.client}>
                {clientLabel || <span className={styles.unlinked}>{t('jobs:list.unlinked')}</span>}
                {project.address && <> · {project.address}</>}
              </span>
            </div>
            {hasMoney && (
              <span style={{ display: 'inline-flex', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {currentValue !== 0 && <span title={t('jobs:money.currentValue')}>{fmtMoneyCompact(currentValue)}</span>}
                {(money?.billed || 0) !== 0 && <span>{t('jobs:money.billedShort', { amount: fmtMoneyCompact(money.billed) })}</span>}
                {(money?.collected || 0) !== 0 && <span>{t('jobs:money.collectedShort', { amount: fmtMoneyCompact(money.collected) })}</span>}
                {(money?.openCoCount || 0) > 0 && <span style={{ color: '#F27243', fontWeight: 600 }}>{t('jobs:money.openCos', { count: money.openCoCount })}</span>}
              </span>
            )}
            <span className={styles.statusPill}>{colName}</span>
            <span className={styles.updated}>{t('jobs:label.updated', { time: timeAgo(project.updated_at) })}</span>
            <span className={styles.chevron}><ChevronRight size={16} /></span>
          </div>
        )
      })}
    </div>
  )
}
