import { useTranslation } from 'react-i18next';
import styles from './StatsTiles.module.css';

const TILE_CONFIG = [
  { key: 'activeJobs', label: 'dashboard:stats.activeJobs' },
  { key: 'clientCount', label: 'dashboard:stats.clients' },
  { key: 'blueprintsThisWeek', label: 'dashboard:stats.blueprintsThisWeek' },
  { key: 'jobsThisMonth', label: 'dashboard:stats.jobsThisMonth' },
  { key: 'teamMembers', label: 'dashboard:stats.teamMembers' },
];

export default function StatsTiles({ stats }) {
  const { t } = useTranslation();
  return (
    <section>
      <h3 className={styles.heading}>{t('dashboard:stats.title')}</h3>
      <div className={styles.grid}>
        {TILE_CONFIG.map(({ key, label }) => (
          <div key={key} className={styles.tile}>
            <div className={styles.label}>{t(label)}</div>
            <div className={styles.value}>{stats[key] ?? 0}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
