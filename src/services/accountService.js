import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { generateAccountNumber } from '../utils/accountNumberGenerator.js';
import { logAudit } from '../utils/auditLogger.js';

export async function openAccount({ customerId, type = 'Savings', currency = 'USD', initialBalance = 0, overdraftLimit = 0 }, reqMeta = {}) {
  const accountNumber = generateAccountNumber();

  const res = await db.query(
    `INSERT INTO accounts (customer_id, account_number, type, balance, overdraft_limit, status, currency)
     VALUES ($1, $2, $3, $4, $5, 'active', $6)
     RETURNING *`,
    [customerId, accountNumber, type, initialBalance, overdraftLimit, currency]
  );

  const account = res.rows[0];

  await logAudit({
    userId: customerId,
    action: 'ACCOUNT_OPENED',
    entityType: 'account',
    entityId: account.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { accountNumber, type, currency },
  });

  return account;
}

export async function getCustomerAccounts(customerId) {
  const res = await db.query(
    `SELECT id, customer_id, account_number, type, balance, overdraft_limit, status, currency, created_at, updated_at
     FROM accounts WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId]
  );
  return res.rows;
}

export async function getAccountById(accountId) {
  const res = await db.query(
    `SELECT id, customer_id, account_number, type, balance, overdraft_limit, status, currency, created_at, updated_at
     FROM accounts WHERE id = $1`,
    [accountId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Account not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  return res.rows[0];
}

export async function getAccountByNumber(accountNumber) {
  const res = await db.query(
    `SELECT id, customer_id, account_number, type, balance, overdraft_limit, status, currency, created_at, updated_at
     FROM accounts WHERE account_number = $1`,
    [accountNumber]
  );

  if (res.rows.length === 0) {
    const err = new Error(`Account with number ${accountNumber} not found.`);
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  return res.rows[0];
}

export async function updateAccountStatus(accountId, newStatus, actingUserId, reqMeta = {}) {
  const res = await db.query(
    `UPDATE accounts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [newStatus, accountId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Account not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  await logAudit({
    userId: actingUserId,
    action: `ACCOUNT_STATUS_CHANGED_${newStatus.toUpperCase()}`,
    entityType: 'account',
    entityId: accountId,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { newStatus },
  });

  return res.rows[0];
}

export default {
  openAccount,
  getCustomerAccounts,
  getAccountById,
  getAccountByNumber,
  updateAccountStatus,
};
