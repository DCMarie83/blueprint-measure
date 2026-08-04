import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import styles from './ThemeToggle.module.css';

const ICONS = { light: '☀', dark: '☾', system: '◐' };

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  return (
    <button type="button" className={styles.toggle} onClick={() => setTheme(next)} aria-label={t('common:themeToggle.aria', { theme })} title={t('common:themeToggle.title', { theme })}>
      <span aria-hidden="true">{ICONS[theme]}</span>
    </button>
  );
}
