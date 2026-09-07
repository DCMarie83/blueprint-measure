import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany';
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
  const { companyId } = useEffectiveCompany();
  const [remindersOn, setRemindersOn] = useState(false);
  const [remLoaded, setRemLoaded] = useState(false);
  const [remSaving, setRemSaving] = useState(false);
  const [remError, setRemError] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    supabase.from('companies').select('invoice_reminders_enabled').eq('id', companyId).single()
      .then(({ data }) => { if (!cancelled) { setRemindersOn(!!data?.invoice_reminders_enabled); setRemLoaded(true); } });
    return () => { cancelled = true; };
  }, [companyId]);

  async function toggleReminders() {
    const next = !remindersOn;
    setRemSaving(true);
    setRemError(null);
    const { error } = await supabase.from('companies')
      .update({ invoice_reminders_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', companyId);
    if (error) setRemError(error.message);
    else setRemindersOn(next);
    setRemSaving(false);
  }

  return (
    <div className={styles.tab}>
      {/* Automatic payment reminders: the tenant's explicit switch. */}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg, 12px)', padding: '16px 20px', marginBottom: 16, background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('settings:reminders.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: 4 }}>{t('settings:reminders.schedule')}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: 2 }}>{t('settings:reminders.importRule')}</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: remLoaded ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={remindersOn} disabled={!remLoaded || remSaving} onChange={toggleReminders} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{remindersOn ? t('settings:reminders.on') : t('settings:reminders.off')}</span>
          </label>
        </div>
        {remError && <p style={{ fontSize: 12, color: 'var(--color-danger, #dc2626)', margin: '8px 0 0' }}>{remError}</p>}
      </div>

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
