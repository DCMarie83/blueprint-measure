import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useUserPrefs } from '../../hooks/useUserPrefs';
import { supabase } from '../../lib/supabase';
import { updateUserPrefs, PREF_OPTIONS, detectBrowserTimezone } from '../../lib/userPrefs';
import { setLanguage } from '../../lib/i18n';
import styles from './PreferencesTab.module.css';

// Theme is owned by ThemeContext (writes user_profiles.theme_preference), so its
// options live here rather than in userPrefs PREF_OPTIONS.
const THEME_OPTIONS = [
  { value: 'light', label: 'settings:preferences.themeOptions.light' },
  { value: 'dark', label: 'settings:preferences.themeOptions.dark' },
  { value: 'system', label: 'settings:preferences.themeOptions.system' },
];

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Bangkok', 'Asia/Dubai',
  'Australia/Sydney', 'UTC',
];

function Field({ label, hint, children }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}><span>{label}</span></div>
      {children}
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

export default function PreferencesTab() {
  const { t } = useTranslation();
  const { user, refreshUserProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const currentPrefs = useUserPrefs();
  const [pending, setPending] = useState(currentPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const detected = detectBrowserTimezone();
  const tzList = useMemo(() => Array.from(new Set([detected, ...COMMON_TIMEZONES])), [detected]);

  // Sync local pending state when saved prefs change (after save or external update)
  useEffect(() => {
    setPending(currentPrefs);
  }, [currentPrefs]);

  const dirty = useMemo(() => {
    return Object.keys(pending).some((k) => pending[k] !== currentPrefs[k]);
  }, [pending, currentPrefs]);

  function update(key, value) {
    setPending((p) => ({ ...p, [key]: value }));
  }

  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    try {
      const delta = {};
      for (const key of Object.keys(pending)) {
        if (pending[key] !== currentPrefs[key]) delta[key] = pending[key];
      }
      if (Object.keys(delta).length === 0) return;
      await updateUserPrefs(supabase, user.id, delta);
      // Apply a language change live so the UI switches without a reload. The
      // write above persisted user_profiles.language; this only re-renders.
      if (delta.language) await setLanguage(delta.language);
      await refreshUserProfile();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(t('settings:preferences.saveError'));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setPending(currentPrefs);
  }

  return (
    <div className={styles.tab}>
      {error && <div className={styles.error}>{error}</div>}
      {savedFlash && <div className={styles.success}>{t('settings:preferences.savedFlash')}</div>}

      <Field label={t('settings:preferences.theme')} hint={t('settings:preferences.themeHint')}>
        <select className={styles.select} value={theme} onChange={(e) => setTheme(e.target.value)}>
          {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
        </select>
      </Field>

      <Field label={t('settings:preferences.language')} hint={t('settings:preferences.languageHint')}>
        <select className={styles.select} value={pending.language} onChange={(e) => update('language', e.target.value)}>
          {PREF_OPTIONS.language.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Field label={t('settings:preferences.timezone')} hint={t('settings:preferences.timezoneHint', { tz: detected })}>
        <select className={styles.select} value={pending.timezone} onChange={(e) => update('timezone', e.target.value)}>
          {tzList.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </Field>

      <Field label={t('settings:preferences.dateFormat')}>
        <select className={styles.select} value={pending.date_format} onChange={(e) => update('date_format', e.target.value)}>
          {PREF_OPTIONS.date_format.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Field label={t('settings:preferences.timeFormat')}>
        <select className={styles.select} value={pending.time_format} onChange={(e) => update('time_format', e.target.value)}>
          {PREF_OPTIONS.time_format.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Field label={t('settings:preferences.firstDayOfWeek')}>
        <select className={styles.select} value={pending.first_day_of_week} onChange={(e) => update('first_day_of_week', e.target.value)}>
          {PREF_OPTIONS.first_day_of_week.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Field label={t('settings:preferences.measurementUnits')} hint={t('settings:preferences.measurementUnitsHint')}>
        <select className={styles.select} value={pending.measurement_units} onChange={(e) => update('measurement_units', e.target.value)}>
          {PREF_OPTIONS.measurement_units.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <div className={styles.actions}>
        <button type="button" className={styles.discardBtn} onClick={handleDiscard} disabled={!dirty || saving}>
          {t('common:action.discard')}
        </button>
        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={!dirty || saving}>
          {saving ? t('settings:preferences.saving') : t('settings:preferences.savePreferences')}
        </button>
      </div>
    </div>
  );
}
