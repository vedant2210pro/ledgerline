/* eslint-disable react-hooks/set-state-in-effect -- Remote state is reset when the requested resource changes. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
export function useRemote<T>(path: string, enabled = true) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    void api<T>(path, { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted) setData(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [path, enabled, revision]);
  return { data, loading, error, reload: useCallback(() => setRevision((v) => v + 1), []) };
}
export function money(value: string | number | null | undefined) {
  const text = String(value ?? '0.00');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const [whole, fraction = '00'] = text.split('.');
  return '₹' + new Intl.NumberFormat('en-IN').format(BigInt(whole)) + '.' + fraction.padEnd(2, '0');
}
export function defaultRange() {
  return {
    date_from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
  };
}
