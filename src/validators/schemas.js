import { z } from 'zod';

const MAX_TRANSACTION_AMOUNT = 100000000000; // 1 Billion Dollars in cents ($1,000,000,000.00)

export const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  full_name: z.string().min(2, 'Full name is required'),
  id_number: z.string().optional(),
  address: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export const openAccountSchema = z.object({
  type: z.enum(['Savings', 'Current']).default('Savings'),
  currency: z.string().length(3).default('USD'),
  customer_id: z.string().uuid().optional(),
});

export const depositSchema = z.object({
  account_id: z.string().uuid('Valid account ID is required'),
  amount: z
    .number()
    .int('Amount must be an integer')
    .positive('Amount must be a positive integer in smallest currency units (e.g. cents)')
    .max(MAX_TRANSACTION_AMOUNT, 'Transaction amount exceeds maximum permissible single limit ($1,000,000,000.00)'),
  reference: z.string().max(255).optional(),
});

export const withdrawSchema = z.object({
  account_id: z.string().uuid('Valid account ID is required'),
  amount: z
    .number()
    .int('Amount must be an integer')
    .positive('Amount must be a positive integer in smallest currency units (e.g. cents)')
    .max(MAX_TRANSACTION_AMOUNT, 'Transaction amount exceeds maximum permissible single limit ($1,000,000,000.00)'),
  reference: z.string().max(255).optional(),
});

export const transferSchema = z.object({
  source_account_id: z.string().uuid('Valid source account ID is required'),
  destination_account_number: z.string().min(8, 'Destination account number is required'),
  amount: z
    .number()
    .int('Amount must be an integer')
    .positive('Amount must be a positive integer in smallest currency units (e.g. cents)')
    .max(MAX_TRANSACTION_AMOUNT, 'Transfer amount exceeds maximum permissible single limit ($1,000,000,000.00)'),
  reference: z.string().max(255).optional(),
});

export const beneficiarySchema = z.object({
  nickname: z.string().min(1, 'Nickname is required'),
  account_number: z.string().min(8, 'Account number is required'),
  bank_name: z.string().default('Internal Bank'),
  routing_number: z.string().optional(),
  is_external: z.boolean().default(false),
});

export const cardSchema = z.object({
  account_id: z.string().uuid('Valid account ID is required'),
  card_type: z.enum(['virtual', 'physical']).default('virtual'),
  daily_limit: z.number().int().positive().max(MAX_TRANSACTION_AMOUNT).optional(),
});

export const loanApplySchema = z.object({
  account_id: z.string().uuid('Valid account ID is required'),
  principal_amount: z
    .number()
    .int()
    .positive('Principal amount must be positive')
    .max(MAX_TRANSACTION_AMOUNT, 'Loan amount exceeds maximum permissible limit'),
  term_months: z.number().int().min(1).max(360, 'Term months must be between 1 and 360'),
});

export const loanApproveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const loanRepaySchema = z.object({
  amount: z
    .number()
    .int()
    .positive('Repayment amount must be positive')
    .max(MAX_TRANSACTION_AMOUNT, 'Repayment amount exceeds maximum limit'),
});

export const accountStatusSchema = z.object({
  status: z.enum(['active', 'frozen', 'closed']),
});
