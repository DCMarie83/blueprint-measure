import { useNavigate } from 'react-router-dom';
import { Briefcase, FilePlus } from 'lucide-react';
import { timeAgo } from '../../utils/timeAgo';
import styles from './RecentActivity.module.css';

const ICON_MAP = {
  project_created: Briefcase,
  blueprint_added: FilePlus,
};

export default function RecentActivity({ recentActivity }) {
  const navigate = useNavigate();

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Recent Activity</h3>

      {recentActivity.length === 0 ? (
        <p className={styles.empty}>No recent activity yet.</p>
      ) : (
        <div className={styles.list}>
          {recentActivity.slice(0, 5).map((event, i) => {
            const Icon = ICON_MAP[event.type] || Briefcase;
            return (
              <div
                key={i}
                className={styles.row}
                onClick={() => navigate(event.link)}
              >
                <Icon size={16} className={styles.icon} />
                <span className={styles.label}>{event.label}</span>
                <span className={styles.time}>{timeAgo(event.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
