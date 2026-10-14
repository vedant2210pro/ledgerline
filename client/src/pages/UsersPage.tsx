/* eslint-disable react-hooks/set-state-in-effect -- Loaded user records initialize the edit form. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { userCreateSchema, userAdminSchema, passwordResetSchema } from '@ledgerline/shared';
import { useAuth } from '../auth/context';
import { useRemote } from '../hooks/useRemote';
import { api } from '../services/api';
import { Pager, ErrorNotice } from '../components/finance/Controls';
type UserRecord = {
  id: string;
  name: string;
  email: string;
  account_status: 'active' | 'disabled' | 'invited';
  row_version: number;
  roles: string[];
};
type Role = { name: string; description: string; permissions: string[] };
const roleNames = ['administrator', 'banking_staff', 'payroll_manager', 'auditor'];
export default function UsersPage() {
  const { id } = useParams(),
    isNew = id === 'new',
    detail = !!id,
    { user } = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const allowed = !!user?.permissions.includes('users.administer'),
    path = detail && !isNew ? '/users/' + id : '/users?' + params;
  const remote = useRemote<
      UserRecord | { items: UserRecord[]; total: number; page: number; pageSize: number }
    >(path, allowed && !isNew),
    roles = useRemote<{ items: Role[] }>('/roles', allowed);
  const [values, setValues] = useState({
      name: '',
      email: '',
      password: '',
      account_status: 'active',
      roles: ['auditor'] as string[],
    }),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<'save' | 'password' | null>(null);
  const record = remote.data && 'id' in remote.data ? remote.data : null,
    list = remote.data && 'items' in remote.data ? remote.data : null;
  useEffect(() => {
    if (record)
      setValues({
        name: record.name,
        email: record.email,
        password: '',
        account_status: record.account_status === 'invited' ? 'disabled' : record.account_status,
        roles: record.roles,
      });
  }, [record]);
  function parsed(reset = false) {
    const v = reset
      ? passwordResetSchema.safeParse({ password, row_version: record?.row_version })
      : isNew
        ? userCreateSchema.safeParse({
            name: values.name,
            email: values.email,
            password: values.password,
            roles: values.roles,
          })
        : userAdminSchema.safeParse({
            name: values.name,
            email: values.email,
            account_status: values.account_status,
            roles: values.roles,
            row_version: record?.row_version,
          });
    if (!v.success) {
      setError(v.error.issues.map((i) => i.message).join(' '));
      return null;
    }
    return v.data;
  }
  async function save(reset = false) {
    if (busy) return;
    const body = parsed(reset);
    if (!body) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await api<UserRecord>(
        reset ? '/users/' + id + '/password' : isNew ? '/users' : '/users/' + id,
        { method: reset || isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) },
      );
      setPassword('');
      setPending(null);
      setValues((v) => ({ ...v, password: '' }));
      if (id === user?.id) {
        window.dispatchEvent(new Event('session-expired'));
        return;
      }
      if (isNew) navigate('/app/users/' + r.id, { replace: true });
      else {
        setNotice(
          reset
            ? 'Password reset. Existing sessions were revoked.'
            : 'User updated. Existing sessions were revoked.',
        );
        remote.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save user.');
      setPending(null);
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <section className="notice">
        <h1>Access restricted</h1>
        <p>Only authorized administrators can manage users.</p>
      </section>
    );
  return (
    <>
      {detail && (
        <Link className="text-link record-back" to="/app/users">
          ← Back to users
        </Link>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS & PERMISSIONS</p>
          <h1>{isNew ? 'Create user' : detail ? 'User details' : 'User management'}</h1>
          <p>Assign the access each person needs. Keep payroll review independent.</p>
        </div>
        {!detail && (
          <Link className="button" to="/app/users/new">
            Create user
          </Link>
        )}
      </div>
      <ErrorNotice message={error || remote.error || roles.error} />
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {!isNew && remote.loading ? (
        <p className="records-empty" role="status">
          Loading users…
        </p>
      ) : detail && (isNew || record) ? (
        <section className="records-panel record-form-panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              if (parsed()) setPending('save');
            }}
          >
            <fieldset disabled={busy || !!pending} className="admin-fieldset">
              <div className="record-form-grid">
                <label className="field">
                  Full name
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={values.name}
                    onChange={(e) => setValues({ ...values, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Email address
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={values.email}
                    onChange={(e) => setValues({ ...values, email: e.target.value })}
                  />
                </label>
                {isNew ? (
                  <label className="field">
                    Initial password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={values.password}
                      onChange={(e) => setValues({ ...values, password: e.target.value })}
                    />
                  </label>
                ) : (
                  <label className="field">
                    Account status
                    <select
                      value={values.account_status}
                      disabled={id === user?.id}
                      onChange={(e) => setValues({ ...values, account_status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                )}
              </div>
              <fieldset className="role-choices">
                <legend>Assigned roles</legend>
                {roleNames.map((role) => (
                  <label key={role}>
                    <input
                      type="checkbox"
                      checked={values.roles.includes(role)}
                      disabled={id === user?.id && role === 'administrator'}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          roles: e.target.checked
                            ? [...values.roles, role]
                            : values.roles.filter((r) => r !== role),
                        })
                      }
                    />
                    {role.replaceAll('_', ' ')}
                  </label>
                ))}
              </fieldset>
              <p className="records-footnote">
                At least one role is required. User updates revoke existing sessions. Your own
                administrator access cannot be removed here.
              </p>
              {isNew && (
                <p className="notice">
                  Share the initial password privately with this person. It will not be shown again
                  or sent by email.
                </p>
              )}
              <div className="form-actions">
                <button className="button">{isNew ? 'Review new user' : 'Review changes'}</button>
              </div>
            </fieldset>
          </form>
          {!isNew && (
            <form
              className="password-reset"
              onSubmit={(e) => {
                e.preventDefault();
                setError('');
                if (parsed(true)) setPending('password');
              }}
            >
              <h2>Reset password</h2>
              <label className="field">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={busy || !!pending}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="button button-outline" disabled={busy || !!pending}>
                Review password reset
              </button>
            </form>
          )}
        </section>
      ) : !detail && list ? (
        <section className="records-panel">
          <form
            className="records-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setParams({
                search: String(f.get('search') || ''),
                status: String(f.get('status') || ''),
                page: '1',
              });
            }}
          >
            <label>
              Search users
              <input name="search" maxLength={80} defaultValue={params.get('search') || ''} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={params.get('status') || ''}>
                <option value="">All</option>
                {['active', 'disabled', 'invited'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button className="button button-outline">Search</button>
          </form>
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="record-link" to={'/app/users/' + r.id}>
                        {r.name}
                      </Link>
                    </td>
                    <td>{r.email}</td>
                    <td>{r.roles.map((s) => s.replaceAll('_', ' ')).join(', ')}</td>
                    <td>{r.account_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.items.length && <p className="records-empty">No users found.</p>}
          <Pager
            page={list.page}
            total={list.total}
            pageSize={list.pageSize}
            onChange={(p) => setParams({ ...Object.fromEntries(params), page: String(p) })}
          />
        </section>
      ) : null}
      {pending && (
        <section className="records-panel related-records">
          <h2>{pending === 'password' ? 'Confirm password reset' : 'Confirm user access'}</h2>
          <p>
            {values.name} · {values.email}
          </p>
          {pending !== 'password' && (
            <p>
              Roles: {values.roles.join(', ')} · Status: {values.account_status}
            </p>
          )}
          <p>
            {isNew
              ? 'This creates a new active application user.'
              : 'Existing sessions for this user will be revoked. Changes to your own account require signing in again.'}
          </p>
          <div className="form-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void save(pending === 'password')}
            >
              {busy ? 'Saving…' : 'Confirm'}
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {roles.data && (
        <section className="records-panel related-records">
          <h2>Role permissions</h2>
          <p>
            Roles are predefined. Assign one or more roles above; permission definitions stay
            controlled by migrations.
          </p>
          {roles.data.items.map((r) => (
            <details className="permission-details" key={r.name}>
              <summary>
                {r.name.replaceAll('_', ' ')} — {r.description}
              </summary>
              <ul>
                {r.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
      {remote.error && (
        <button className="button button-outline" onClick={remote.reload}>
          Reload users
        </button>
      )}
    </>
  );
}
