import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../services/api';
afterEach(() => vi.unstubAllGlobals());
it('GET validation errors explain the invalid filter instead of referring to absent highlights', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the highlighted fields.',
              fields: { page: 'Must be positive' },
              requestId: 'test',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
  );
  await expect(api('/accounts?page=0')).rejects.toThrow(
    'Unable to load these filters. page: Must be positive',
  );
});
it('form validation retains structured field errors for input highlighting', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the highlighted fields.',
              fields: { name: 'Too short' },
              requestId: 'test',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
  );
  await expect(api('/customers', { method: 'POST', body: '{}' })).rejects.toMatchObject({
    message: 'Check the highlighted fields.',
    fields: { name: 'Too short' },
  });
});
