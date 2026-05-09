import styles from './NotificationsTab.module.css';

const CHANNELS = ['Email', 'SMS', 'In-app'];
const TYPES = [
  { id: 'estimates', label: 'Estimates', desc: 'Sent, viewed, approved, declined' },
  { id: 'invoices', label: 'Invoices', desc: 'Sent, paid, overdue' },
  { id: 'errors', label: 'System errors', desc: 'Critical errors on your account' },
  { id: 'marketing', label: 'Product updates', desc: 'New features and announcements' },
];

export default function NotificationsTab() {
  return (
    <div className={styles.tab}>
      <div className={styles.banner}>Notification controls go live with billing. You'll be able to choose what you receive and where.</div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thLabel}>Type</th>
            {CHANNELS.map(c => <th key={c} className={styles.th}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {TYPES.map(t => (
            <tr key={t.id}>
              <td className={styles.tdLabel}>
                <div className={styles.label}>{t.label}</div>
                <div className={styles.desc}>{t.desc}</div>
              </td>
              {CHANNELS.map(c => (
                <td key={c} className={styles.td}>
                  <input type="checkbox" disabled aria-label={`${t.label} ${c}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
