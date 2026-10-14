import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthState } from '../auth/context';
import { api } from '../services/api';
import DashboardPage from '../pages/DashboardPage';
import ReportsPage from '../pages/ReportsPage';
import UsersPage from '../pages/UsersPage';
import AuditPage from '../pages/AuditPage';
vi.mock('../services/api', async (original) => ({
  ...(await original<typeof import('../services/api')>()),
  api: vi.fn(),
}));
const mocked = vi.mocked(api);
const permissions = [
  'reports.banking.view',
  'reports.banking.export',
  'reports.payroll.view',
  'reports.payroll.export',
  'users.administer',
  'audit.view',
];
function renderPage(
  page: 'dashboard' | 'reports' | 'users' | 'audit-logs',
  id = '',
  perms = permissions,
) {
  const state: AuthState = {
    user: {
      id: '1',
      name: 'Test Admin',
      email: 'admin@example.test',
      roles: ['administrator'],
      permissions: perms,
    },
    loading: false,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={state}>
      <MemoryRouter initialEntries={['/app/' + page + (id ? '/' + id : '')]}>
        <Routes>
          <Route
            path={'/app/' + page + (id ? '/:id' : '')}
            element={
              page === 'dashboard' ? (
                <DashboardPage />
              ) : page === 'reports' ? (
                <ReportsPage />
              ) : page === 'users' ? (
                <UsersPage />
              ) : (
                <AuditPage />
              )
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
afterEach(() => {
  cleanup();
  mocked.mockReset();
  vi.unstubAllGlobals();
});
it('live dashboard displays database totals and honest empty charts', async () => {
  mocked.mockResolvedValue({
    date_from: '2026-10-01',
    date_to: '2026-10-13',
    banking: {
      accounts: 10,
      customers: 10,
      balance: '1234567890123456.78',
      frozen: 10,
      deposits: '0.00',
      withdrawals: '0.00',
      transfers: '0.00',
      trend: [],
      recent: [],
    },
  });
  renderPage('dashboard', '', ['reports.banking.view']);
  await screen.findByText('No postings in this period');
  expect(screen.getByText('₹1,23,45,67,89,01,23,456.78')).toBeTruthy();
  expect(screen.queryByText('Payroll by month')).toBeNull();
  expect(screen.getByText('10 frozen · 10 customers')).toBeTruthy();
});
it('dashboard errors do not display fabricated zero totals and can retry', async () => {
  mocked.mockRejectedValue(new Error('Database unavailable'));
  renderPage('dashboard');
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Database unavailable');
  expect(screen.queryByText('Current account balances')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh dashboard' }));
  await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));
});
it('reports restrict tabs by permissions and send date/status filters', async () => {
  mocked.mockResolvedValue({
    columns: [{ key: 'employee', label: 'Employee' }],
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    note: 'Payroll dates',
    date_from: '2026-10-01',
    date_to: '2026-10-13',
  });
  renderPage('reports', '', ['reports.payroll.view']);
  await screen.findByText('No records match these filters.');
  expect(screen.queryByRole('button', { name: 'Banking ledger' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  const u = userEvent.setup();
  await u.selectOptions(screen.getByLabelText('Status / type'), 'approved');
  await u.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() => expect(mocked.mock.calls.at(-1)?.[0]).toContain('status=approved'));
});
it('CSV export errors show a message instead of downloading a partial file', async () => {
  mocked.mockResolvedValue({
    columns: [],
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    note: 'Ledger',
    date_from: '2026-10-01',
    date_to: '2026-10-13',
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: { message: 'Narrow the filters to export at most 5,000 rows.' },
        }),
      }),
  );
  renderPage('reports');
  await screen.findByText('No records match these filters.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Export CSV' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Narrow the filters to export at most 5,000 rows.',
  );
});
it('user creation requires review and does not display the initial password', async () => {
  mocked.mockImplementation(async (path, options) => {
    if (path === '/roles') return { items: [] };
    if (options?.method === 'POST') throw new Error('Test creation unavailable');
    return { items: [], total: 0, page: 1, pageSize: 10 };
  });
  renderPage('users', 'new');
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Full name'), 'Payroll Reviewer');
  await u.type(screen.getByLabelText('Email address'), 'reviewer@example.test');
  await u.type(screen.getByLabelText('Initial password'), 'long-test-password-123');
  await u.click(screen.getByLabelText('auditor'));
  await u.click(screen.getByLabelText('payroll manager'));
  await u.click(screen.getByRole('button', { name: 'Review new user' }));
  expect(screen.getByRole('heading', { name: 'Confirm user access' })).toBeTruthy();
  expect(mocked.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  expect(screen.queryByText('long-test-password-123')).toBeNull();
  await u.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText('Test creation unavailable');
  const sent = mocked.mock.calls.find(([, o]) => o?.method === 'POST');
  expect(JSON.parse(String(sent?.[1]?.body)).roles).toEqual(['payroll_manager']);
});
it('self-administration disables removal of the current administrator role', async () => {
  mocked.mockImplementation(async (path) =>
    path === '/roles'
      ? { items: [] }
      : {
          id: '1',
          name: 'Test Admin',
          email: 'admin@example.test',
          roles: ['administrator'],
          account_status: 'active',
          row_version: 0,
        },
  );
  renderPage('users', '1');
  await screen.findByLabelText('Full name');
  expect(screen.getByLabelText('administrator').hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Account status').hasAttribute('disabled')).toBe(true);
});
it('audit entries render recorded before and after details safely', async () => {
  mocked.mockResolvedValue({
    items: [
      {
        id: '1',
        created_at: '2026-10-13',
        actor: 'Admin',
        action: 'users.update',
        entity_type: 'users',
        entity_id: '2',
        before_values: { roles: ['auditor'] },
        after_values: { roles: ['payroll_manager'] },
        http_request_id: 'test',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  renderPage('audit-logs');
  await screen.findByText('users.update');
  expect(screen.getByText(/"payroll_manager"/)).toBeTruthy();
  expect(screen.getByText('Request: test')).toBeTruthy();
});
