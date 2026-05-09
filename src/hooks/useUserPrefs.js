import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { resolveUserPrefs } from '../lib/userPrefs';

export function useUserPrefs() {
  const { userProfile } = useAuth();
  return useMemo(() => resolveUserPrefs(userProfile), [userProfile]);
}
