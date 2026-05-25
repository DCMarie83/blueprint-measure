import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import ProfileTab from '../components/settings/ProfileTab';
import PreferencesTab from '../components/settings/PreferencesTab';
import NotificationsTab from '../components/settings/NotificationsTab';
import BrandingTab from '../components/settings/BrandingTab';
import styles from './SettingsPage.module.css';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'branding', label: 'Branding' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [active, setActive] = useState('profile');
  if (!user) return null;
  return (
    <div className={styles.page}>
      <AppHeader />
      <div className={styles.content}>
        <div className={styles.settingsHeader}>
          <h1 className={styles.title}>Settings</h1>
        </div>
        <nav className={styles.tabs} role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              className={active === t.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <section className={styles.body}>
          {active === 'profile' && <ProfileTab />}
          {active === 'preferences' && <PreferencesTab />}
          {active === 'notifications' && <NotificationsTab />}
          {active === 'branding' && <BrandingTab />}
        </section>
      </div>
    </div>
  );
}
