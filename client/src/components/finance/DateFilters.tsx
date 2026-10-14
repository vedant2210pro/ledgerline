import type { FormEvent } from 'react';
import { defaultRange } from '../../hooks/useRemote';
export function DateFilters({
  params,
  onChange,
  search = false,
  statuses = [],
  dates = true,
}: {
  params: URLSearchParams;
  onChange: (v: Record<string, string>) => void;
  search?: boolean;
  statuses?: string[];
  dates?: boolean;
}) {
  const range = defaultRange();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onChange({
      ...Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)])),
      page: '1',
    });
  }
  return (
    <form className="records-toolbar" onSubmit={submit}>
      {dates && (
        <>
          <label>
            From (UTC)
            <input
              key={'from' + params.get('date_from')}
              type="date"
              name="date_from"
              required
              defaultValue={params.get('date_from') || range.date_from}
            />
          </label>
          <label>
            To (UTC)
            <input
              key={'to' + params.get('date_to')}
              type="date"
              name="date_to"
              required
              defaultValue={params.get('date_to') || range.date_to}
            />
          </label>
        </>
      )}
      {search && (
        <label>
          Search
          <input
            key={'search' + params.get('search')}
            name="search"
            defaultValue={params.get('search') || ''}
            placeholder="Name, code or reference"
            maxLength={80}
          />
        </label>
      )}
      {statuses.length > 0 && (
        <label>
          Status / type
          <select
            key={'status' + params.get('status')}
            name="status"
            defaultValue={params.get('status') || ''}
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="button button-outline">Apply filters</button>
    </form>
  );
}
