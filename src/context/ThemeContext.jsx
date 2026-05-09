import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { updateUserPrefs } from '../lib/userPrefs';

const ThemeContext = createContext(null);

function applyThemeAttribute(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children }) {
  const { user, userProfile, refreshUserProfile } = useAuth();
  const [theme, setThemeState] = useState(() => localStorage.getItem('rivetdog-theme') || 'system');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userProfile?.theme && userProfile.theme !== theme) {
      setThemeState(userProfile.theme);
    }
  }, [userProfile?.theme]);

  useEffect(() => {
    applyThemeAttribute(theme);
    localStorage.setItem('rivetdog-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeAttribute('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback(async (next) => {
    const prev = theme;
    setThemeState(next);
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateUserPrefs(supabase, user.id, { theme: next });
      await refreshUserProfile?.();
    } catch (err) {
      setThemeState(prev);
      console.error('Failed to save theme preference', err);
    } finally {
      setSaving(false);
    }
  }, [theme, user?.id, refreshUserProfile]);

  const value = useMemo(() => ({ theme, setTheme, applyTheme: applyThemeAttribute, saving }), [theme, setTheme, saving]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
