/* eslint-disable react-hooks/set-state-in-effect -- Lookup search resets remote loading state. */
import { useEffect, useState } from 'react';
import type { Lookup } from '@ledgerline/shared';
import { api } from '../../services/api';
export function LookupSelect({
  label,
  path,
  value,
  onChange,
  disabled = false,
  currentLabel,
}: {
  label: string;
  path: string;
  value: string;
  onChange: (id: string, label?: string) => void;
  disabled?: boolean;
  currentLabel?: string;
}) {
  const [search, setSearch] = useState(''),
    [items, setItems] = useState<Lookup[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const id = label.toLowerCase().replaceAll(' ', '-');
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void api<{ items: Lookup[] }>(path + '?search=' + encodeURIComponent(search), {
        signal: c.signal,
      })
        .then((r) => {
          setItems(r.items);
          setError('');
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [path, search]);
  return (
    <div className="field">
      <label htmlFor={id + '-search'}>Find {label.toLowerCase()}</label>
      <input
        id={id + '-search'}
        placeholder="Search name or code"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
      />
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        required
        value={value}
        onChange={(e) => {
          const selected = items.find((i) => i.id === e.target.value);
          onChange(e.target.value, selected ? selected.name + ' — ' + selected.detail : undefined);
        }}
        disabled={disabled || loading}
      >
        <option value="">{loading ? 'Loading…' : 'Choose ' + label.toLowerCase()}</option>
        {value && !items.some((i) => i.id === value) && (
          <option value={value}>{currentLabel || 'Selected record #' + value}</option>
        )}
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} — {i.detail}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="field-error">
          {error} Change the search to retry.
        </p>
      )}
    </div>
  );
}
export function Pager({
  page,
  total,
  pageSize = 10,
  onChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="records-pagination">
      <span>
        {total} records · Page {page}
      </span>
      <div>
        <button
          className="button button-outline"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <button
          className="button button-outline"
          disabled={page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="notice error" role="alert">
      {message}
    </p>
  ) : null;
}
