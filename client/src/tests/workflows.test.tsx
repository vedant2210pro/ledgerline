import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { User, RecordItem } from '@ledgerline/shared';
import { AuthContext, type AuthState } from '../auth/context';
import LoginPage from '../pages/LoginPage';
import RecordsPage from '../pages/RecordsPage';
import RecordPage from '../pages/RecordPage';
import ProtectedRoute from '../auth/ProtectedRoute';
import { api, RequestError } from '../services/api';
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const user: User = {
  id: '1',
  name: 'Test reviewer',
  email: 'review@example.test',
  roles: ['administrator'],
  permissions: [
    'customers.view',
    'customers.create',
    'customers.update',
    'accounts.view',
    'accounts.create',
    'accounts.update',
    'branches.view',
    'branches.create',
    'branches.update',
  ],
};
const auth = (overrides: Partial<AuthState> = {}): AuthState => ({
  user,
  loading: false,
  error: '',
  login: vi.fn(),
  logout: vi.fn(),
  reload: vi.fn(),
  ...overrides,
});
function renderRoute(content: ReactNode, path: string, pattern: string, state = auth()) {
  return render(
    <AuthContext.Provider value={state}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={content} />
          <Route path="/login" element={<p>Sign-in destination</p>} />
          <Route path="/app/customers/:id" element={<p>Created customer detail</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  mockedApi.mockReset();
});
describe('authentication UI', () => {
  it('validates login fields and submits normalized credentials without local storage', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Email or password is incorrect.'));
    renderRoute(<LoginPage />, '/sign-in', '/sign-in', auth({ user: null, login }));
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(login).not.toHaveBeenCalled();
    await u.type(screen.getByLabelText('Work email'), 'REVIEW@example.test');
    await u.type(screen.getByLabelText('Password'), 'Fictional-test-password');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('review@example.test', 'Fictional-test-password'),
    );
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Email or password is incorrect.',
    );
    expect(localStorage.length).toBe(0);
  });
  it('protects routes and offers a retry for connection failures', () => {
    const first = renderRoute(<ProtectedRoute />, '/private', '/private', auth({ user: null }));
    expect(screen.getByText('Sign-in destination')).toBeTruthy();
    first.unmount();
    renderRoute(
      <ProtectedRoute />,
      '/private',
      '/private',
      auth({ user: null, error: 'Service unavailable' }),
    );
    expect(screen.getByRole('alert').textContent).toBe('Service unavailable');
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeTruthy();
  });
});
describe('record UI', () => {
  it('renders API data, sends search filters and paginates without inventing totals', async () => {
    mockedApi.mockResolvedValue({
      items: [
        {
          id: '1',
          name: 'Fictional customer',
          email: 'fiction@example.test',
          phone: '000000',
          account_count: 0,
          customer_status: 'active',
          row_version: 0,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 11,
    });
    renderRoute(<RecordsPage module="customers" />, '/app/customers', '/app/customers');
    expect(await screen.findByRole('link', { name: 'Fictional customer' })).toBeTruthy();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Search Customers'), 'Fictional');
    await u.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenLastCalledWith(
        expect.stringContaining('search=Fictional'),
        expect.anything(),
      ),
    );
    await u.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenLastCalledWith(
        expect.stringContaining('page=2'),
        expect.anything(),
      ),
    );
  });
  it('shows loading, empty and service failure states', async () => {
    mockedApi.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    renderRoute(<RecordsPage module="customers" />, '/app/customers', '/app/customers');
    expect(await screen.findByText('No customers found')).toBeTruthy();
    mockedApi.mockRejectedValue(new Error('Service unavailable'));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Service unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
  it('hides forbidden create controls and blocks direct create URLs', async () => {
    mockedApi.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const first = renderRoute(
      <RecordsPage module="customers" />,
      '/app/customers',
      '/app/customers',
      auth({ user: { ...user, permissions: ['customers.view'] } }),
    );
    await screen.findByText('No customers found');
    expect(screen.queryByRole('link', { name: 'Add customer' })).toBeNull();
    first.unmount();
    renderRoute(
      <RecordPage module="customers" />,
      '/app/customers/new',
      '/app/customers/new',
      auth({ user: { ...user, permissions: ['customers.view'] } }),
    );
    expect(screen.getByText('Access restricted')).toBeTruthy();
  });
  it('creates a customer using the real shared validator and navigates to its detail', async () => {
    mockedApi.mockResolvedValue({ id: '91', row_version: 0 });
    renderRoute(<RecordPage module="customers" />, '/app/customers/new', '/app/customers/new');
    const u = userEvent.setup();
    await screen.findByLabelText('Full name');
    await u.click(screen.getByRole('button', { name: 'Create customer' }));
    expect(mockedApi).not.toHaveBeenCalled();
    await u.type(screen.getByLabelText('Full name'), 'Fictional customer');
    await u.type(screen.getByLabelText('Email address'), 'person@example.test');
    await u.type(screen.getByLabelText('Phone number'), '+91 90000 00000');
    await u.type(screen.getByLabelText('Address'), '123 Fictional Street');
    await u.click(screen.getByRole('button', { name: 'Create customer' }));
    await screen.findByText('Created customer detail');
    expect(mockedApi).toHaveBeenCalledWith('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Fictional customer',
        email: 'person@example.test',
        phone: '+91 90000 00000',
        address: '123 Fictional Street',
        customer_status: 'active',
      }),
    });
  });
  it('uses bounded relationship lookups and never offers an opening balance field', async () => {
    mockedApi.mockImplementation(async (path) =>
      path.includes('employees')
        ? { items: [{ id: '3', name: 'Test officer', detail: 'QA · active' }] }
        : path.includes('customers')
          ? { items: [{ id: '2', name: 'Test customer', detail: 'test@example.test' }] }
          : { id: '4' },
    );
    renderRoute(<RecordPage module="accounts" />, '/app/accounts/new', '/app/accounts/new');
    await screen.findByRole('option', { name: 'Test officer — QA · active' });
    expect(screen.queryByLabelText(/balance/i)).toBeNull();
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText('Customer'), '2');
    await u.selectOptions(screen.getByLabelText('Account officer'), '3');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/accounts',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = mockedApi.mock.calls.find((c) => c[0] === '/accounts')!;
    expect(JSON.parse(String(call[1]?.body))).not.toHaveProperty('balance');
  });
  it('confirms status changes, keeps versioning and explains stale edits', async () => {
    const record = {
      id: '6',
      name: 'Fictional branch',
      branch_code: 'TEST',
      address: '123 Test Street',
      phone: '+91 90000 00000',
      branch_status: 'active',
      row_version: 3,
    } satisfies RecordItem;
    mockedApi.mockImplementation(async (_path, options) => {
      if (options?.method === 'PATCH')
        throw new RequestError(409, {
          code: 'STALE_RECORD',
          message: 'This record changed. Reload before saving.',
          requestId: 'test',
        });
      return record;
    });
    renderRoute(<RecordPage module="branches" />, '/app/branches/6', '/app/branches/:id');
    const u = userEvent.setup();
    await screen.findByLabelText('Branch name');
    await u.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    const modal = await screen.findByRole('dialog');
    expect(mockedApi.mock.calls.filter((c) => c[1]?.method === 'PATCH').length).toBe(0);
    await u.click(within(modal).getByRole('button', { name: 'Confirm change' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This record changed.');
    const call = mockedApi.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]?.body)).row_version).toBe(3);
  });
  it('shows imported-account review restrictions without claiming an activation occurred', async () => {
    mockedApi.mockResolvedValue({
      id: '9',
      account_number: 'LEGACY-A-9',
      customer_id: '2',
      employee_id: '3',
      customer_name: 'Fictional customer',
      employee_name: 'Fictional officer',
      balance: '125.50',
      currency: 'INR',
      account_status: 'frozen',
      account_type: 'savings',
      open_date: '2020-01-01',
      row_version: 0,
      reconciliation_state: 'pending',
    });
    renderRoute(
      <RecordPage module="accounts" />,
      '/app/accounts/9',
      '/app/accounts/:id',
      auth({ user: { ...user, permissions: ['accounts.view'] } }),
    );
    await screen.findByText('Opening balance review required');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(within(screen.getByRole('complementary')).getByText('₹125.50')).toBeTruthy();
  });
});
