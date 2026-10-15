import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext, type AuthState } from '../auth/context';
import OpeningBalanceReview from '../components/finance/OpeningBalanceReview';
import { api, RequestError } from '../services/api';

vi.mock('../services/api', async (original) => ({
  ...(await original<typeof import('../services/api')>()),
  api: vi.fn(),
}));
const mocked = vi.mocked(api);
const opening = {
  account_id: '10',
  account_number: 'LEGACY-A-10',
  account_status: 'frozen',
  row_version: 2,
  balance: '68000.00',
  opening_balance: '68000.00',
  source_balance: '68000.00',
  net_movement: '0.00',
  discrepancy: '0.00',
  reconciliation_state: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  source_account_id: '10',
  source_digest: 'a'.repeat(64),
  imported_at: '2026-10-01T10:00:00.000Z',
  source_matches: true,
};
const reviewNote = 'Compared original account records and confirmed the opening balance.';
function auth(roles = ['administrator'], permissions = ['accounts.view']): AuthState {
  return {
    user: { id: '1', name: 'Test Admin', email: 'admin@example.test', roles, permissions },
    loading: false,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  };
}
function renderReview(state = auth(), onReviewed = vi.fn()) {
  return {
    ...render(
      <AuthContext.Provider value={state}>
        <OpeningBalanceReview accountId="10" onReviewed={onReviewed} />
      </AuthContext.Provider>,
    ),
    onReviewed,
  };
}
async function prepareConfirmation() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox'));
  await user.type(screen.getByLabelText('Review note'), reviewNote);
  await user.click(screen.getByRole('button', { name: 'Review confirmation' }));
  return user;
}
afterEach(() => {
  cleanup();
  mocked.mockReset();
});

it('requires explicit comparison, note and final review; saves no balance or status change', async () => {
  mocked.mockImplementation(async (_path, options) =>
    options?.method === 'POST'
      ? {
          ...opening,
          reconciliation_state: 'reviewed',
          row_version: 3,
          reviewed_by: '1',
          reviewed_at: '2026-10-15T10:00:00.000Z',
          review_note: reviewNote,
        }
      : opening,
  );
  const { onReviewed } = renderReview();
  const review = await screen.findByRole('button', { name: 'Review confirmation' });
  expect(review).toHaveProperty('disabled', true);
  const user = await prepareConfirmation();
  expect(mocked.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(0);
  expect(screen.getByRole('region', { name: 'Confirm opening balance review' })).toHaveProperty(
    'tabIndex',
    -1,
  );
  await user.click(screen.getByRole('button', { name: 'Confirm review' }));
  await screen.findByText('Opening balance reviewed');
  expect(onReviewed).toHaveBeenCalledTimes(1);
  expect(mocked).toHaveBeenLastCalledWith('/accounts/10/opening-review', {
    method: 'POST',
    body: JSON.stringify({
      row_version: 2,
      opening_balance: '68000.00',
      review_note: reviewNote,
      confirmed: true,
    }),
  });
  expect(screen.getByText(/Account status: frozen/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Confirm review' })).toBeNull();
});

it('lets account viewers inspect values but reserves approval for administrators', async () => {
  mocked.mockResolvedValue(opening);
  renderReview(auth(['auditor']));
  await screen.findByText(/Ask an administrator/);
  expect(screen.getAllByText('₹68,000.00')).toHaveLength(3);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Review confirmation' })).toBeNull();
});

it('does not fetch or expose opening data without accounts.view permission', () => {
  renderReview(auth(['payroll_manager'], []));
  expect(mocked).not.toHaveBeenCalled();
  expect(screen.queryByText('Opening balance review')).toBeNull();
});

it.each([
  { discrepancy: '0.01', source_matches: true },
  { discrepancy: '0.00', source_matches: false, source_balance: null },
])('blocks review when reconciliation or original source checks fail: %j', async (failure) => {
  mocked.mockResolvedValue({ ...opening, ...failure });
  renderReview();
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('Review is blocked'),
  );
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Review confirmation' })).toBeNull();
});

it('reloads stale details and requires a new comparison after a conflicting review', async () => {
  let reloads = 0;
  mocked.mockImplementation(async (_path, options) => {
    if (options?.method === 'POST')
      throw new RequestError(409, {
        code: 'STALE_RECORD',
        message: 'This account changed. Reload it.',
        requestId: 'test',
      });
    reloads++;
    return { ...opening, row_version: reloads === 1 ? 2 : 3 };
  });
  const { onReviewed } = renderReview();
  const user = await prepareConfirmation();
  await user.click(screen.getByRole('button', { name: 'Confirm review' }));
  await waitFor(() => expect(reloads).toBe(2));
  const check = await screen.findByRole('checkbox');
  expect(check).toHaveProperty('checked', false);
  expect(screen.getByRole('button', { name: 'Review confirmation' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByRole('alert').textContent).toContain('Review was not saved.');
  expect(onReviewed).not.toHaveBeenCalled();
  expect(screen.queryByText('Opening balance reviewed')).toBeNull();
});

it('shows a retry for read failures without inventing balances', async () => {
  mocked.mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue(opening);
  renderReview();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Database unavailable');
  expect(screen.queryByText('₹0.00')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reload review' }));
  await screen.findByText('Matches the saved import');
  expect(mocked).toHaveBeenCalledTimes(2);
});

it('displays previous reviewer, time and note without allowing repeat approval', async () => {
  mocked.mockResolvedValue({
    ...opening,
    reconciliation_state: 'reviewed',
    reviewed_by: '42',
    reviewed_at: '2026-10-14 10:30:00',
    review_note: reviewNote,
  });
  renderReview();
  await screen.findByText('Opening balance reviewed');
  expect(screen.getByText(/Reviewed by user #42/)).toBeTruthy();
  expect(screen.getByText(reviewNote)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('clears confirmation and draft note when navigating to another account', async () => {
  mocked.mockResolvedValue(opening);
  const state = auth();
  const result = renderReview(state);
  await prepareConfirmation();
  result.rerender(
    <AuthContext.Provider value={state}>
      <OpeningBalanceReview accountId="11" onReviewed={result.onReviewed} />
    </AuthContext.Provider>,
  );
  expect(await screen.findByRole('checkbox')).toHaveProperty('checked', false);
  expect(screen.getByLabelText('Review note')).toHaveProperty('value', '');
  expect(screen.queryByRole('button', { name: 'Confirm review' })).toBeNull();
});
