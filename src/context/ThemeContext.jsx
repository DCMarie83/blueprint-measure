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
  const { user, userProfile, refreshUserProfile, company } = useAuth();
  const [theme, setThemeState] = useState(() => localStorage.getItem('rivetdog-theme') || 'system');
  const [saving, setSaving] = useState(false);

  // Sync theme_preference from user_profiles. If NULL (first load after column added), migrate the
  // current localStorage value to DB so future loads are authoritative from DB.
  useEffect(() => {
    if (userProfile == null || !user?.id) return;
    const VALID = ['light', 'dark', 'system'];
    const dbPref = userProfile.theme_preference;
    if (dbPref && VALID.includes(dbPref)) {
      setThemeState(dbPref);
      localStorage.setItem('rivetdog-theme', dbPref);
    } else {
      // Migration: write current local theme to DB so it persists
      const current = localStorage.getItem('rivetdog-theme') || 'system';
      supabase.from('user_profiles').update({ theme_preference: current }).eq('user_id', user.id)
        .then(({ error }) => { if (error) console.warn('Theme migration write failed:', error.message); });
    }
  }, [userProfile, user?.id]);

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

  // Tenant brand color overrides — applied after data-theme so they survive light/dark toggle
  useEffect(() => {
    const root = document.documentElement;
    if (company?.primary_color) {
      root.style.setProperty('--color-primary', company.primary_color);
    } else {
      root.style.removeProperty('--color-primary');
    }
    if (company?.accent_color) {
      root.style.setProperty('--color-accent', company.accent_color);
    } else {
      root.style.removeProperty('--color-accent');
    }
    return () => {
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--color-accent');
    };
  }, [company?.primary_color, company?.accent_color]);

  const setTheme = useCallback(async (next) => {
    const prev = theme;
    setThemeState(next);
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ theme_preference: next })
        .eq('user_id', user.id);
      if (error) throw error;
    } catch (err) {
      setThemeState(prev);
      console.error('Failed to save theme preference', err);
    } finally {
      setSaving(false);
    }
  }, [theme, user?.id]);

  const value = useMemo(() => ({ theme, setTheme, applyTheme: applyThemeAttribute, saving }), [theme, setTheme, saving]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
