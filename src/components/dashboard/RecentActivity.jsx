import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, FilePlus, ChevronDown } from 'lucide-react';
import { timeAgo } from '../../utils/timeAgo';
import styles from './RecentActivity.module.css';

const ICON_MAP = {
  project_created: Briefcase,
  blueprint_added: FilePlus,
};

export default function RecentActivity({ recentActivity }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.section}>
      <button className={styles.headerBtn} onClick={() => setCollapsed(v => !v)}>
        <ChevronDown size={16} className={collapsed ? styles.chevronClosed : styles.chevronOpen} />
        <h3 className={styles.sectionTitle}>Recent Activity</h3>
      </button>

      {!collapsed && (
        recentActivity.length === 0 ? (
          <p className={styles.empty}>Quiet day in the yard.</p>
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
        )
      )}
    </div>
  );
}
