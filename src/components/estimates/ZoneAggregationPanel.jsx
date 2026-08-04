import { RefreshCw, Plus, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './ZoneAggregationPanel.module.css'

const TYPE_KEYS = { SF: 'common:units.sf', LF: 'common:units.lf', count: 'estimates:zones.typeCount' }
const UNIT_KEYS = { SF: 'common:units.sf', LF: 'common:units.lf', count: 'common:units.count' }

export default function ZoneAggregationPanel({ zones, onAddZone, onRefresh, readOnly }) {
  const { t } = useTranslation()
  if (zones.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>
            <MapPin size={16} /> {t('estimates:zones.title')}
          </h3>
        </div>
        <div className={styles.emptyState}>
          {t('estimates:zones.empty')}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>
          <MapPin size={16} /> {t('estimates:zones.titleCount', { count: zones.length })}
        </h3>
        {!readOnly && onRefresh && (
          <button className={styles.refreshBtn} onClick={onRefresh} title={t('estimates:zones.refreshTitle')}>
            <RefreshCw size={13} /> {t('estimates:zones.refresh')}
          </button>
        )}
      </div>
      <div className={styles.zoneList}>
        {zones.map(zone => (
          <div key={zone.key} className={styles.zoneRow}>
            <div className={styles.zoneTop}>
              <span className={styles.zoneName}>{zone.display_name}</span>
              <span className={styles.typeBadge}>{TYPE_KEYS[zone.measurement_type] ? t(TYPE_KEYS[zone.measurement_type]) : zone.measurement_type}</span>
            </div>
            <div className={styles.zoneResult}>
              {zone.total_result.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className={styles.zoneUnit}> {UNIT_KEYS[zone.measurement_type] ? t(UNIT_KEYS[zone.measurement_type]) : zone.measurement_type}</span>
            </div>
            <div className={styles.zoneSub}>
              {t('estimates:zones.fromBlueprints', { count: zone.source_session_ids.length })}
            </div>
            {!readOnly && (
              <button
                className={styles.addBtn}
                onClick={() => onAddZone(zone)}
              >
                <Plus size={14} /> {t('estimates:zones.addLineItem')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
