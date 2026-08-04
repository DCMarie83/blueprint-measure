import { useTranslation } from 'react-i18next';
import styles from './NotificationsTab.module.css';

const CHANNELS = [
  { id: 'email', labelKey: 'settings:notifications.channels.email' },
  { id: 'sms', labelKey: 'settings:notifications.channels.sms' },
  { id: 'inApp', labelKey: 'settings:notifications.channels.inApp' },
];
const TYPES = [
  { id: 'estimates', labelKey: 'settings:notifications.types.estimates.label', descKey: 'settings:notifications.types.estimates.desc' },
  { id: 'invoices', labelKey: 'settings:notifications.types.invoices.label', descKey: 'settings:notifications.types.invoices.desc' },
  { id: 'errors', labelKey: 'settings:notifications.types.errors.label', descKey: 'settings:notifications.types.errors.desc' },
  { id: 'marketing', labelKey: 'settings:notifications.types.marketing.label', descKey: 'settings:notifications.types.marketing.desc' },
];

export default function NotificationsTab() {
  const { t } = useTranslation();
  return (
    <div className={styles.tab}>
      <div className={styles.banner}>{t('settings:notifications.banner')}</div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thLabel}>{t('settings:notifications.typeHeader')}</th>
            {CHANNELS.map(c => <th key={c.id} className={styles.th}>{t(c.labelKey)}</th>)}
          </tr>
        </thead>
        <tbody>
          {TYPES.map(type => (
            <tr key={type.id}>
              <td className={styles.tdLabel}>
                <div className={styles.label}>{t(type.labelKey)}</div>
                <div className={styles.desc}>{t(type.descKey)}</div>
              </td>
              {CHANNELS.map(c => (
                <td key={c.id} className={styles.td}>
                  <input type="checkbox" disabled aria-label={t('settings:notifications.ariaCell', { type: t(type.labelKey), channel: t(c.labelKey) })} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
