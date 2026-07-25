import crypto from 'crypto';
import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { logAudit } from '../utils/auditLogger.js';

/**
 * Deposits funds into an account atomically.
 */
export async function deposit({ accountId, amount, reference = 'Deposit', userId }, reqMeta = {}) {
  if (!amount || amount <= 0) {
    const err = new Error('Deposit amount must be a positive integer.');
    err.statusCode = 400;
    err.code = ERROR_CODES.INVALID_TRANSACTION_AMOUNT;
    throw err;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Pessimistically lock account
    const accRes = await client.query(
      `SELECT id, balance, overdraft_limit, status FROM accounts WHERE id = $1 FOR UPDATE`,
      [accountId]
    );

    if (accRes.rows.length === 0) {
      const err = new Error('Account not found.');
      err.statusCode = 404;
      err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
      throw err;
    }

    const account = accRes.rows[0];

    if (account.status === 'frozen') {
      const err = new Error('Account is frozen. Deposits are temporarily prohibited.');
      err.statusCode = 403;
      err.code = ERROR_CODES.ACCOUNT_FROZEN;
      throw err;
    }

    if (account.status === 'closed') {
      const err = new Error('Account is closed.');
      err.statusCode = 400;
      err.code = ERROR_CODES.ACCOUNT_CLOSED;
      throw err;
    }

    // 2. Update balance
    const updateRes = await client.query(
      `UPDATE accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING balance`,
      [amount, accountId]
    );
    const newBalance = updateRes.rows[0].balance;

    // 3. Append ledger entry
    const txRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, balance_after, reference, created_by)
       VALUES ($1, 'DEPOSIT', $2, $3, $4, $5)
       RETURNING *`,
      [accountId, amount, newBalance, reference, userId || null]
    );

    const transaction = txRes.rows[0];

    await logAudit(
      {
        userId,
        action: 'DEPOSIT',
        entityType: 'account',
        entityId: accountId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        details: { amount, balanceAfter: newBalance, reference },
      },
      client
    );

    await client.query('COMMIT');
    return transaction;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Withdraws funds from an account atomically with overdraft check.
 */
export async function withdraw({ accountId, amount, reference = 'Withdrawal', userId }, reqMeta = {}) {
  if (!amount || amount <= 0) {
    const err = new Error('Withdrawal amount must be a positive integer.');
    err.statusCode = 400;
    err.code = ERROR_CODES.INVALID_TRANSACTION_AMOUNT;
    throw err;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Pessimistically lock account
    const accRes = await client.query(
      `SELECT id, balance, overdraft_limit, status FROM accounts WHERE id = $1 FOR UPDATE`,
      [accountId]
    );

    if (accRes.rows.length === 0) {
      const err = new Error('Account not found.');
      err.statusCode = 404;
      err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
      throw err;
    }

    const account = accRes.rows[0];

    if (account.status === 'frozen') {
      const err = new Error('Account is frozen. Withdrawals are prohibited.');
      err.statusCode = 403;
      err.code = ERROR_CODES.ACCOUNT_FROZEN;
      throw err;
    }

    if (account.status === 'closed') {
      const err = new Error('Account is closed.');
      err.statusCode = 400;
      err.code = ERROR_CODES.ACCOUNT_CLOSED;
      throw err;
    }

    const currentBal = BigInt(account.balance);
    const overdraft = BigInt(account.overdraft_limit);
    const drawAmt = BigInt(amount);

    if (currentBal - drawAmt < -overdraft) {
      const err = new Error('Insufficient funds. Transaction exceeds balance and overdraft limit.');
      err.statusCode = 400;
      err.code = ERROR_CODES.INSUFFICIENT_FUNDS;
      throw err;
    }

    // 2. Update balance
    const updateRes = await client.query(
      `UPDATE accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING balance`,
      [amount, accountId]
    );
    const newBalance = updateRes.rows[0].balance;

    // 3. Append ledger entry
    const txRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, balance_after, reference, created_by)
       VALUES ($1, 'WITHDRAWAL', $2, $3, $4, $5)
       RETURNING *`,
      [accountId, amount, newBalance, reference, userId || null]
    );

    const transaction = txRes.rows[0];

    await logAudit(
      {
        userId,
        action: 'WITHDRAWAL',
        entityType: 'account',
        entityId: accountId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        details: { amount, balanceAfter: newBalance, reference },
      },
      client
    );

    await client.query('COMMIT');
    return transaction;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Transfers funds between two accounts atomically with deterministic deadlock-free locking.
 */
export async function transfer({ sourceAccountId, destAccountNumber, amount, reference = 'Fund Transfer', userId }, reqMeta = {}) {
  if (!amount || amount <= 0) {
    const err = new Error('Transfer amount must be a positive integer.');
    err.statusCode = 400;
    err.code = ERROR_CODES.INVALID_TRANSACTION_AMOUNT;
    throw err;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Find destination account ID first
    const destFindRes = await client.query(`SELECT id FROM accounts WHERE account_number = $1`, [destAccountNumber]);
    if (destFindRes.rows.length === 0) {
      const err = new Error(`Destination account with number ${destAccountNumber} not found.`);
      err.statusCode = 404;
      err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
      throw err;
    }

    const destAccountId = destFindRes.rows[0].id;

    if (sourceAccountId === destAccountId) {
      const err = new Error('Cannot transfer funds to the same account.');
      err.statusCode = 400;
      err.code = ERROR_CODES.SAME_ACCOUNT_TRANSFER;
      throw err;
    }

    // 1. Sort Account IDs to prevent deadlocks under concurrent cross-transfers
    const sortedIds = [sourceAccountId, destAccountId].sort();

    // Acquire locks in deterministic order
    const lockRes = await client.query(
      `SELECT id, account_number, balance, overdraft_limit, status FROM accounts WHERE id IN ($1, $2) ORDER BY id ASC FOR UPDATE`,
      [sortedIds[0], sortedIds[1]]
    );

    const accountsMap = new Map(lockRes.rows.map((a) => [a.id, a]));

    const sourceAcc = accountsMap.get(sourceAccountId);
    const destAcc = accountsMap.get(destAccountId);

    if (!sourceAcc) {
      const err = new Error('Source account not found.');
      err.statusCode = 404;
      err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
      throw err;
    }

    if (!destAcc) {
      const err = new Error('Destination account not found.');
      err.statusCode = 404;
      err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
      throw err;
    }

    // Validate account status
    if (sourceAcc.status === 'frozen') {
      const err = new Error('Source account is frozen. Transfers are prohibited.');
      err.statusCode = 403;
      err.code = ERROR_CODES.ACCOUNT_FROZEN;
      throw err;
    }
    if (sourceAcc.status === 'closed') {
      const err = new Error('Source account is closed.');
      err.statusCode = 400;
      err.code = ERROR_CODES.ACCOUNT_CLOSED;
      throw err;
    }

    if (destAcc.status === 'frozen') {
      const err = new Error('Destination account is frozen.');
      err.statusCode = 403;
      err.code = ERROR_CODES.ACCOUNT_FROZEN;
      throw err;
    }
    if (destAcc.status === 'closed') {
      const err = new Error('Destination account is closed.');
      err.statusCode = 400;
      err.code = ERROR_CODES.ACCOUNT_CLOSED;
      throw err;
    }

    // Validate balance + overdraft limit
    const srcBal = BigInt(sourceAcc.balance);
    const srcOverdraft = BigInt(sourceAcc.overdraft_limit);
    const transferAmt = BigInt(amount);

    if (srcBal - transferAmt < -srcOverdraft) {
      const err = new Error('Insufficient funds for transfer.');
      err.statusCode = 400;
      err.code = ERROR_CODES.INSUFFICIENT_FUNDS;
      throw err;
    }

    // 2. Perform two-sided updates
    const srcUpdate = await client.query(
      `UPDATE accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING balance`,
      [amount, sourceAccountId]
    );
    const newSrcBal = srcUpdate.rows[0].balance;

    const destUpdate = await client.query(
      `UPDATE accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING balance`,
      [amount, destAccountId]
    );
    const newDestBal = destUpdate.rows[0].balance;

    // Shared UUID linking both legs of the transfer
    const transferId = crypto.randomUUID();

    // Debit leg
    const debitRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, balance_after, reference, transfer_id, created_by)
       VALUES ($1, 'TRANSFER_DEBIT', $2, $3, $4, $5, $6)
       RETURNING *`,
      [sourceAccountId, amount, newSrcBal, `Transfer to Acc #${destAcc.account_number}: ${reference}`, transferId, userId || null]
    );

    // Credit leg
    const creditRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, balance_after, reference, transfer_id, created_by)
       VALUES ($1, 'TRANSFER_CREDIT', $2, $3, $4, $5, $6)
       RETURNING *`,
      [destAccountId, amount, newDestBal, `Transfer from Acc #${sourceAcc.account_number}: ${reference}`, transferId, userId || null]
    );

    await logAudit(
      {
        userId,
        action: 'TRANSFER',
        entityType: 'transfer',
        entityId: transferId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        details: {
          sourceAccountId,
          destAccountId,
          amount,
          transferId,
        },
      },
      client
    );

    await client.query('COMMIT');

    return {
      transferId,
      debitTransaction: debitRes.rows[0],
      creditTransaction: creditRes.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gets transaction history for an account with pagination, filtering, and sorting.
 */
export async function getAccountTransactions(accountId, options = {}) {
  const limit = parseInt(options.limit, 10) || 50;
  const offset = parseInt(options.offset, 10) || 0;
  const type = options.type || null;
  const startDate = options.startDate || null;
  const endDate = options.endDate || null;
  const order = (options.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  if (db.isInMemory()) {
    let rows = db.memoryDb.transactions.filter((t) => t.account_id === accountId);
    
    if (type) {
      rows = rows.filter((t) => t.type === type);
    }
    if (startDate) {
      rows = rows.filter((t) => new Date(t.created_at) >= new Date(startDate));
    }
    if (endDate) {
      rows = rows.filter((t) => new Date(t.created_at) <= new Date(endDate));
    }
    
    rows.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return order === 'ASC' ? timeA - timeB : timeB - timeA;
    });

    const total = rows.length;
    const paginated = rows.slice(offset, offset + limit).map((t) => ({
      ...t,
      amount: t.amount.toString(),
      balance_after: t.balance_after.toString(),
    }));

    return {
      transactions: paginated,
      pagination: {
        total,
        limit,
        offset,
      },
    };
  }

  // Real PostgreSQL query
  let queryText = `
    SELECT id, account_id, type, amount, balance_after, reference, transfer_id, related_transaction_id, created_by, created_at
    FROM transactions
    WHERE account_id = $1
  `;
  const params = [accountId];
  let paramIndex = 2;

  if (type) {
    queryText += ` AND type = $${paramIndex++}`;
    params.push(type);
  }
  if (startDate) {
    queryText += ` AND created_at >= $${paramIndex++}`;
    params.push(startDate);
  }
  if (endDate) {
    queryText += ` AND created_at <= $${paramIndex++}`;
    params.push(endDate);
  }

  queryText += ` ORDER BY created_at ${order} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const res = await db.query(queryText, params);

  // Get total count
  let countQueryText = `SELECT COUNT(*) FROM transactions WHERE account_id = $1`;
  const countParams = [accountId];
  let countParamIndex = 2;

  if (type) {
    countQueryText += ` AND type = $${countParamIndex++}`;
    countParams.push(type);
  }
  if (startDate) {
    countQueryText += ` AND created_at >= $${countParamIndex++}`;
    countParams.push(startDate);
  }
  if (endDate) {
    countQueryText += ` AND created_at <= $${countParamIndex++}`;
    countParams.push(endDate);
  }

  const countRes = await db.query(countQueryText, countParams);
  const total = parseInt(countRes.rows[0].count, 10);

  return {
    transactions: res.rows,
    pagination: {
      total,
      limit,
      offset,
    },
  };
}

export default {
  deposit,
  withdraw,
  transfer,
  getAccountTransactions,
};
