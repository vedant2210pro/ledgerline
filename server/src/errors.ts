import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from '@ledgerline/shared';
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const requestId: RequestHandler = (_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-ID', res.locals.requestId);
  res.setHeader('Cache-Control', 'no-store');
  next();
};
export const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }
  let status = 500,
    code = 'INTERNAL_ERROR',
    message = 'The request could not be completed. Please try again.';
  let fields: Record<string, string> | undefined;
  if (error instanceof ApiError) {
    ({ status, code, message } = error);
  } else if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Check the highlighted fields.';
    fields = Object.fromEntries(error.issues.map((i) => [i.path.join('.') || 'form', i.message]));
  } else if (error?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Send valid JSON.';
  } else if (error?.type === 'entity.too.large') {
    status = 413;
    code = 'BODY_TOO_LARGE';
    message = 'The request is too large.';
  } else if (error?.code === 'ER_SIGNAL_EXCEPTION') {
    const allowed = [
      'Account is not active',
      'Branch is not active',
      'Insufficient funds',
      'Idempotency key payload conflict',
      'Operation not authorized',
      'Payroll requires independent approval',
      'Employee is not active',
      'Transaction cannot be reversed',
      'Historical payroll already reserves this employee month',
      'Review the imported opening balance before account activation',
      'Posting requires an active account',
    ];
    if (allowed.includes(error.sqlMessage)) {
      status = 409;
      code = 'OPERATION_REJECTED';
      message = error.sqlMessage;
    }
  } else if (error?.code === 'ER_DATA_OUT_OF_RANGE') {
    status = 422;
    code = 'AMOUNT_LIMIT';
    message = 'The resulting amount exceeds the supported limit.';
  } else if (error?.code === 'ER_DUP_ENTRY') {
    status = 409;
    code = 'DUPLICATE';
    message = 'That email, code or reference is already in use.';
  } else if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code)) {
    status = 409;
    code = 'RETRY_REQUIRED';
    message = 'Another change is in progress. Reload the record and try again.';
  } else if (
    [
      'AUTH_BUSY',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'PROTOCOL_CONNECTION_LOST',
      'ER_CON_COUNT_ERROR',
      'ER_ACCESS_DENIED_ERROR',
    ].includes(error?.code)
  ) {
    status = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'The database is temporarily unavailable.';
  }
  if (status >= 500)
    console.error(
      JSON.stringify({
        requestId: res.locals.requestId,
        code,
        driverCode: typeof error?.code === 'string' ? error.code : undefined,
      }),
    );
  res.status(status).json({
    error: { code, message, requestId: res.locals.requestId, ...(fields ? { fields } : {}) },
  });
};
