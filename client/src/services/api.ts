import type { ApiFailure } from '@ledgerline/shared';
export class RequestError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  requestId?: string;
  constructor(status: number, error: ApiFailure['error']) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
    this.requestId = error.requestId;
  }
}
let csrfToken = '';
export function setCsrf(value: string) {
  csrfToken = value;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the service. Check your connection and try again.', {
      cause: error,
    });
  }
  if (!response.ok) {
    let data: ApiFailure;
    try {
      data = await response.json();
    } catch {
      throw new Error('The service returned an unexpected response. Please try again.');
    }
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('session-expired'));
    throw new RequestError(
      response.status,
      data.error || { code: 'UNEXPECTED', message: 'The request failed.', requestId: '' },
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
