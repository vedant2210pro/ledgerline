import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthResponse, User } from '@ledgerline/shared';
import { api, RequestError, setCsrf } from '../services/api';
import { AuthContext } from './context';
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    api<AuthResponse>('/auth/me', { signal: c.signal })
      .then((r) => {
        setUser(r.user);
        setCsrf(r.csrfToken);
        setError('');
      })
      .catch((e) => {
        if (c.signal.aborted) return;
        setUser(null);
        if (!(e instanceof RequestError && e.status === 401)) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [revision]);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setCsrf('');
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    setRevision((v) => v + 1);
  }, []);
  const login = async (email: string, password: string) => {
    const r = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setCsrf(r.csrfToken);
    setUser(r.user);
    setError('');
  };
  const logout = async () => {
    await api<void>('/auth/logout', { method: 'POST', body: '{}' });
    setCsrf('');
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, reload }}>
      {children}
    </AuthContext.Provider>
  );
}
