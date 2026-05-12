import { RefreshCw, Plus, MapPin } from 'lucide-react'
import styles from './ZoneAggregationPanel.module.css'

const TYPE_LABELS = { SF: 'SF', LF: 'LF', count: 'Count' }
const UNIT_LABELS = { SF: 'SF', LF: 'LF', count: 'units' }

export default function ZoneAggregationPanel({ zones, onAddZone, onRefresh, readOnly }) {
  if (zones.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>
            <MapPin size={16} /> Zones
          </h3>
        </div>
        <div className={styles.emptyState}>
          No measured zones yet. Add zones to your blueprints.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>
          <MapPin size={16} /> Zones ({zones.length})
        </h3>
        {!readOnly && onRefresh && (
          <button className={styles.refreshBtn} onClick={onRefresh} title="Refresh from blueprints">
            <RefreshCw size={13} /> Refresh
          </button>
        )}
      </div>
      <div className={styles.zoneList}>
        {zones.map(zone => (
          <div key={zone.key} className={styles.zoneRow}>
            <div className={styles.zoneTop}>
              <span className={styles.zoneName}>{zone.display_name}</span>
              <span className={styles.typeBadge}>{TYPE_LABELS[zone.measurement_type] || zone.measurement_type}</span>
            </div>
            <div className={styles.zoneResult}>
              {zone.total_result.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className={styles.zoneUnit}> {UNIT_LABELS[zone.measurement_type] || zone.measurement_type}</span>
            </div>
            <div className={styles.zoneSub}>
              from {zone.source_session_ids.length} blueprint{zone.source_session_ids.length !== 1 ? 's' : ''}
            </div>
            {!readOnly && (
              <button
                className={styles.addBtn}
                onClick={() => onAddZone(zone)}
              >
                <Plus size={14} /> Add Line Item
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
