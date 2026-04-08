import styles from './ZoneList.module.css'

const TYPE_COLORS = {
  SF: '#2e8bff',
  LF: '#22c55e',
  count: '#f59e0b',
}

// Shows all saved zones for the session in a scrollable sidebar list.
export default function ZoneList({ zones, onDelete }) {
  if (zones.length === 0) {
    return (
      <div className={styles.empty}>
        No zones yet. Select a measurement type and click the canvas to start drawing.
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {zones.map(zone => (
        <div key={zone.id} className={styles.zone}>
          <div className={styles.zoneTop}>
            <span className={styles.zoneName}>{zone.name}</span>
            <span
              className={styles.zoneType}
              style={{ background: TYPE_COLORS[zone.measurement_type] + '22', color: TYPE_COLORS[zone.measurement_type] }}
            >
              {zone.measurement_type}
            </span>
          </div>
          <div className={styles.zoneResult}>
            {zone.result ?? 0}{' '}
            <span className={styles.zoneUnit}>
              {zone.measurement_type === 'SF' ? 'sq ft'
                : zone.measurement_type === 'LF' ? 'lin ft'
                : 'count'}
            </span>
          </div>
          <button className={styles.deleteBtn} onClick={() => onDelete(zone.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
