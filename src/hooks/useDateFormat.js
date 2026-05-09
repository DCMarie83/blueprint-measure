import { useCallback } from 'react';
import { useUserPrefs } from './useUserPrefs';
import { formatDate, formatDateTime, formatTime, formatRelative } from '../lib/formatDate';

export function useDateFormat() {
  const prefs = useUserPrefs();
  return {
    formatDate: useCallback((v) => formatDate(v, prefs), [prefs]),
    formatDateTime: useCallback((v) => formatDateTime(v, prefs), [prefs]),
    formatTime: useCallback((v) => formatTime(v, prefs), [prefs]),
    formatRelative: useCallback((v) => formatRelative(v), []),
  };
}
