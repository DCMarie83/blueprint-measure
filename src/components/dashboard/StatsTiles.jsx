import styles from './StatsTiles.module.css';

const TILE_CONFIG = [
  { key: 'activeJobs', label: 'Active Jobs' },
  { key: 'clientCount', label: 'Clients' },
  { key: 'blueprintsThisWeek', label: 'Blueprints This Week' },
  { key: 'jobsThisMonth', label: 'Jobs This Month' },
  { key: 'teamMembers', label: 'Team Members' },
];

export default function StatsTiles({ stats }) {
  return (
    <section>
      <h3 className={styles.heading}>Account Summary</h3>
      <div className={styles.grid}>
        {TILE_CONFIG.map(({ key, label }) => (
          <div key={key} className={styles.tile}>
            <div className={styles.label}>{label}</div>
            <div className={styles.value}>{stats[key] ?? 0}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
