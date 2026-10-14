import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext, type AuthState } from '../auth/context';
import TransactionsPage from '../pages/TransactionsPage';
import PayrollPage from '../pages/PayrollPage';
import RecordPage from '../pages/RecordPage';
import { api, RequestError } from '../services/api';
vi.mock('../services/api', async (original) => ({
  ...(await original<typeof import('../services/api')>()),
  api: vi.fn(),
}));
const mocked = vi.mocked(api);
function renderPage(
  page: 'transactions' | 'payroll' | 'employees',
  id = '',
  permissions = [
    'transactions.view',
    'transactions.process',
    'payroll.view',
    'payroll.create',
    'payroll.update',
    'payroll.approve',
    'payroll.process',
    'employees.view',
    'employees.update',
  ],
) {
  const auth: AuthState = {
    user: {
      id: '1',
      name: 'Tester',
      email: 'test@example.test',
      roles: ['administrator'],
      permissions,
    },
    loading: false,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/app/' + page + (id ? '/' + id : '')]}>
        <Routes>
          <Route
            path={'/app/' + page + (id ? '/:id' : '')}
            element={
              page === 'transactions' ? (
                <TransactionsPage />
              ) : page === 'employees' ? (
                <RecordPage module="employees" />
              ) : (
                <PayrollPage />
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
  sessionStorage.clear();
});
it('posts only after review and retries an uncertain result with exactly the same key and payload', async () => {
  let calls = 0;
  mocked.mockImplementation(async (path, options) => {
    if (path === '/transactions/deposit') {
      calls++;
      if (calls === 1) throw new Error('Connection lost');
      if (calls === 2)
        throw new RequestError(403, {
          code: 'FORBIDDEN',
          message: 'Permission changed',
          requestId: 'test',
        });
      return { reference_number: 'test-reference', replayed: true };
    }
    if (path.startsWith('/lookups/'))
      return { items: [{ id: '1', name: 'Test account', detail: 'Test record' }] };
    if (options?.method) throw new Error('Unexpected mutation');
    return { items: [], total: 0, page: 1, pageSize: 10 };
  });
  renderPage('transactions');
  const u = userEvent.setup();
  await screen.findByRole('option', { name: 'Test account — Test record' }).catch(() => undefined);
  await waitFor(() =>
    expect(screen.getByLabelText('Account').hasAttribute('disabled')).toBe(false),
  );
  await u.selectOptions(screen.getByLabelText('Account'), '1');
  await u.selectOptions(screen.getByLabelText('Branch'), '1');
  await u.type(screen.getByLabelText('Amount · INR'), '10.25');
  await u.type(screen.getByLabelText('Description'), 'Fictional deposit');
  await u.click(screen.getByRole('button', { name: 'Review transaction' }));
  expect(calls).toBe(0);
  await u.click(screen.getByRole('button', { name: 'Confirm posting' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection lost');
  expect(screen.queryByRole('button', { name: 'Back to editing' })).toBeNull();
  const saved = JSON.parse(sessionStorage.getItem('ledgerline:posting:1') || 'null');
  expect(saved.attempted).toBe(true);
  await u.click(screen.getByRole('button', { name: 'Retry same request' }));
  await screen.findByText('Permission changed');
  expect(screen.queryByRole('button', { name: 'Back to editing' })).toBeNull();
  await u.click(screen.getByRole('button', { name: 'Retry same request' }));
  await screen.findByText('Previous posting confirmed');
  const posts = mocked.mock.calls.filter(([path]) => path === '/transactions/deposit');
  expect(posts).toHaveLength(3);
  expect(posts[0][1]?.body).toBe(posts[2][1]?.body);
  expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  await waitFor(() => expect(sessionStorage.getItem('ledgerline:posting:1')).toBeNull());
});
it('auditors see history but cannot open posting controls', async () => {
  mocked.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  renderPage('transactions', '', ['transactions.view']);
  await screen.findByText('No transactions found.');
  expect(screen.queryByRole('button', { name: 'Review transaction' })).toBeNull();
});
it('payroll previews exact decimal arithmetic and blocks invalid deductions', async () => {
  mocked.mockResolvedValue({ items: [] });
  renderPage('payroll', 'new');
  await screen.findByLabelText('Base salary · INR');
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Base salary · INR'), '0.10');
  await u.clear(screen.getByLabelText('Bonus · INR'));
  await u.type(screen.getByLabelText('Bonus · INR'), '0.20');
  await u.clear(screen.getByLabelText('Deductions · INR'));
  await u.type(screen.getByLabelText('Deductions · INR'), '0.01');
  expect(screen.getByText('₹0.29')).toBeTruthy();
  await u.clear(screen.getByLabelText('Deductions · INR'));
  await u.type(screen.getByLabelText('Deductions · INR'), '0.31');
  expect(screen.getByRole('button', { name: 'Save draft' }).hasAttribute('disabled')).toBe(true);
});
it('a payroll preparer cannot approve their own submitted record', async () => {
  mocked.mockImplementation(async (path) =>
    path.endsWith('/audit?page=1')
      ? { items: [], total: 0 }
      : {
          id: '12',
          employee_id: '1',
          employee_name: 'Test employee',
          employee_code: 'TEST',
          payroll_period: '2026-10-01',
          salary_amount: '10.00',
          bonus: '1.00',
          deductions: '0.00',
          net_salary: '11.00',
          payroll_status: 'pending_approval',
          created_by: '1',
          row_version: 1,
        },
  );
  renderPage('payroll', '12');
  await screen.findByText('Another authorized person must approve or reject payroll you prepared.');
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(screen.getByLabelText('Base salary · INR').hasAttribute('disabled')).toBe(true);
});
it('processed payroll is read-only and shows its reference and audit', async () => {
  mocked.mockImplementation(async (path) =>
    path.includes('/audit?')
      ? {
          items: [
            {
              id: '1',
              action: 'payroll.process',
              actor_name: 'Reviewer',
              created_at: '2026-10-13',
            },
          ],
          total: 1,
        }
      : {
          id: '12',
          employee_id: '1',
          employee_name: 'Test employee',
          employee_code: 'TEST',
          payroll_period: '2026-10-01',
          salary_amount: '10.00',
          bonus: '1.00',
          deductions: '0.00',
          net_salary: '11.00',
          payroll_status: 'processed',
          processing_reference: 'payroll-test-reference',
          created_by: '2',
          row_version: 2,
        },
  );
  renderPage('payroll', '12');
  await screen.findByText('payroll-test-reference');
  expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Process payroll' })).toBeNull();
  expect(screen.getByText('process')).toBeTruthy();
});
it('imported employees require explicit missing employment details', async () => {
  mocked.mockResolvedValue({
    id: '1',
    name: 'Imported employee',
    employee_code: 'LEG-1',
    department: 'Operations',
    email: 'legacy@example.test',
    phone: '+91 9000000000',
    designation: null,
    date_of_joining: null,
    employment_status: 'legacy_incomplete',
    row_version: 0,
  });
  renderPage('employees', '1');
  await screen.findByText(
    'Confirm the missing designation and joining date before activating this imported employee.',
  );
  expect((screen.getByLabelText('Designation') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Joining date') as HTMLInputElement).value).toBe('');
});
