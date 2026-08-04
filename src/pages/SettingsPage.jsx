import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ProfileTab from '../components/settings/ProfileTab';
import PreferencesTab from '../components/settings/PreferencesTab';
import NotificationsTab from '../components/settings/NotificationsTab';
import BrandingTab from '../components/settings/BrandingTab';
import PaymentInstructionsTab from '../components/settings/PaymentInstructionsTab';
import styles from './SettingsPage.module.css';

const TABS = [
  { id: 'profile', label: 'settings:page.tabs.profile' },
  { id: 'preferences', label: 'settings:page.tabs.preferences' },
  { id: 'notifications', label: 'settings:page.tabs.notifications' },
  { id: 'branding', label: 'settings:page.tabs.branding' },
  { id: 'payments', label: 'settings:page.tabs.payments' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [active, setActive] = useState('profile');
  if (!user) return null;
  return (
    <div className={styles.page}>
      
      <div className={styles.content}>
        <div className={styles.settingsHeader}>
          <h1 className={styles.title}>{t('settings:page.title')}</h1>
        </div>
        <nav className={styles.tabs} role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active === tab.id}
              className={active === tab.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setActive(tab.id)}
            >
              {t(tab.label)}
            </button>
          ))}
        </nav>
        <section className={styles.body}>
          {active === 'profile' && <ProfileTab />}
          {active === 'preferences' && <PreferencesTab />}
          {active === 'notifications' && <NotificationsTab />}
          {active === 'branding' && <BrandingTab />}
          {active === 'payments' && <PaymentInstructionsTab />}
        </section>
      </div>
    </div>
  );
}
