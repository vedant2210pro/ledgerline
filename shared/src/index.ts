import { z } from 'zod';
export { ZodError, z } from 'zod';
export const idSchema = z.string().regex(/^[1-9][0-9]{0,18}$/, 'Choose a valid record.');
const name = z.string().trim().min(2, 'Enter at least 2 characters.').max(120);
const email = z.string().trim().toLowerCase().email('Enter a valid email.').max(254);
const phone = z
  .string()
  .trim()
  .min(6)
  .max(25)
  .regex(/^[+0-9() .-]+$/, 'Use a valid phone number.');
const address = z.string().trim().min(5).max(500);
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const customerSchema = z.strictObject({
  name,
  email,
  phone,
  address,
  customer_status: z.enum(['active', 'inactive']),
});
export const branchSchema = z.strictObject({
  branch_code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/),
  name,
  address,
  phone,
  branch_status: z.enum(['active', 'inactive']),
});
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return v >= '1000-01-01' && !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Enter a valid date.');
export const accountSchema = z.strictObject({
  customer_id: idSchema,
  employee_id: idSchema,
  account_type: z.enum(['savings', 'current', 'salary']),
  open_date: date,
});
export const accountUpdateSchema = z.strictObject({
  employee_id: idSchema,
  account_status: z.enum(['active', 'frozen', 'closed']),
  row_version: z.number().int().min(0).max(4294967295),
});
export const customerUpdateSchema = customerSchema.extend({
  row_version: z.number().int().min(0).max(4294967295),
});
export const branchUpdateSchema = branchSchema.extend({
  row_version: z.number().int().min(0).max(4294967295),
});
export const listSchema = z.strictObject({
  search: z.string().trim().max(80).default(''),
  status: z.string().max(20).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type Module = 'customers' | 'accounts' | 'branches' | 'employees';
export type CustomerInput = z.infer<typeof customerSchema>;
export type BranchInput = z.infer<typeof branchSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type User = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
};
export type AuthResponse = { user: User; csrfToken: string };
export type RecordItem = { id: string; row_version: number; [key: string]: string | number | null };
export type PageResult = { items: RecordItem[]; page: number; pageSize: number; total: number };
export type Lookup = { id: string; name: string; detail: string };
export type ApiFailure = {
  error: { code: string; message: string; requestId: string; fields?: Record<string, string> };
};

export const moneySchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/, 'Use an amount with at most two decimal places.');
export function cents(value: string): bigint {
  const [whole, fraction = ''] = moneySchema.parse(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function decimal(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
export const positiveMoneySchema = moneySchema.refine(
  (v) => !moneySchema.safeParse(v).success || cents(v) > 0n,
  'Amount must be positive.',
);
const description = z.string().trim().min(3).max(500);
export const requestKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const postingSchema = z.strictObject({
  account_id: idSchema,
  branch_id: idSchema,
  amount: positiveMoneySchema,
  description,
  idempotency_key: requestKeySchema,
});
export const transferSchema = postingSchema
  .extend({ destination_account_id: idSchema })
  .refine((v) => v.account_id !== v.destination_account_id, {
    message: 'Choose a different destination account.',
    path: ['destination_account_id'],
  });
export const reversalSchema = z.strictObject({
  branch_id: idSchema,
  reason: description,
  idempotency_key: requestKeySchema,
});
export const employeeSchema = z.strictObject({
  employee_code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(24)
    .regex(/^[A-Z0-9-]+$/),
  name,
  department: z.string().trim().min(2).max(100),
  phone,
  email,
  designation: z.string().trim().min(2).max(100),
  date_of_joining: date,
  employment_status: z.enum(['active', 'on_leave', 'inactive']),
});
export const employeeUpdateSchema = employeeSchema.extend({
  row_version: z.number().int().min(0).max(4294967295),
});
export const payrollAmountsSchema = z
  .strictObject({ salary_amount: moneySchema, bonus: moneySchema, deductions: moneySchema })
  .superRefine((v, ctx) => {
    if (![v.salary_amount, v.bonus, v.deductions].every((x) => moneySchema.safeParse(x).success))
      return;
    const gross = cents(v.salary_amount) + cents(v.bonus);
    if (gross > 999999999999999999n)
      ctx.addIssue({
        code: 'custom',
        path: ['bonus'],
        message: 'Gross salary exceeds the supported amount.',
      });
    if (cents(v.deductions) > gross)
      ctx.addIssue({
        code: 'custom',
        path: ['deductions'],
        message: 'Deductions cannot exceed gross salary.',
      });
  });
export const payrollSchema = payrollAmountsSchema.safeExtend({
  employee_id: idSchema,
  payroll_period: date.refine(
    (v) => v.endsWith('-01'),
    'Choose the first day of the payroll month.',
  ),
});
export const payrollUpdateSchema = payrollSchema.safeExtend({
  row_version: z.number().int().min(0).max(4294967295),
});
export const workflowSchema = z.strictObject({
  row_version: z.number().int().min(0).max(4294967295),
  reason: description.optional(),
});
export const processPayrollSchema = z.strictObject({
  idempotency_key: requestKeySchema,
  description,
});
export const historySchema = listSchema
  .extend({
    account_id: idSchema.optional(),
    date_from: date.optional(),
    date_to: date.optional(),
  })
  .refine((v) => !v.date_from || !v.date_to || v.date_from <= v.date_to, {
    message: 'End date must follow start date.',
    path: ['date_to'],
  });

export const reportFilterSchema = z
  .strictObject({
    date_from: date.default(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)),
    date_to: date.default(() => new Date().toISOString().slice(0, 10)),
    search: z.string().trim().max(80).default(''),
    status: z.string().max(24).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine(
    (v) =>
      v.date_from <= v.date_to &&
      (Date.parse(v.date_to) - Date.parse(v.date_from)) / 86400000 <= 366,
    { message: 'Choose an ordered date range of at most 367 days.', path: ['date_to'] },
  );
export const roleSchema = z.enum(['administrator', 'banking_staff', 'payroll_manager', 'auditor']);
export const userCreateSchema = z.strictObject({
  name,
  email,
  password: z.string().min(12).max(128),
  roles: z
    .array(roleSchema)
    .min(1)
    .max(4)
    .refine((v) => new Set(v).size === v.length, 'Choose each role once.'),
});
export const userAdminSchema = z.strictObject({
  name,
  email,
  account_status: z.enum(['active', 'disabled']),
  roles: z
    .array(roleSchema)
    .min(1)
    .max(4)
    .refine((v) => new Set(v).size === v.length, 'Choose each role once.'),
  row_version: z.number().int().min(0).max(4294967295),
});
export const passwordResetSchema = z.strictObject({
  password: z.string().min(12).max(128),
  row_version: z.number().int().min(0).max(4294967295),
});
export type ReportKind = 'banking' | 'payroll' | 'accounts' | 'branches';
export type ReportResult = {
  columns: { key: string; label: string }[];
  items: Record<string, string | number | null>[];
  total: number;
  page: number;
  pageSize: number;
  date_from: string;
  date_to: string;
  note: string;
};
export type DashboardResult = {
  date_from: string;
  date_to: string;
  banking?: {
    accounts: number;
    customers: number;
    balance: string;
    frozen: number;
    deposits: string;
    withdrawals: string;
    transfers: string;
    trend: { day: string; credits: string; debits: string }[];
    recent: Record<string, string>[];
  };
  payroll?: {
    employees: number;
    processed: string;
    pending: number;
    trend: { month: string; net: string; count: number }[];
    recent: Record<string, string>[];
  };
};
