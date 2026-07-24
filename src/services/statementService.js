import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { generateStatementPDF } from '../utils/pdfGenerator.js';

export async function getAccountStatement(accountId, { startDate, endDate, format = 'json' }, userId) {
  const accRes = await db.query(`SELECT * FROM accounts WHERE id = $1`, [accountId]);
  if (accRes.rows.length === 0) {
    const err = new Error('Account not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  const account = accRes.rows[0];

  const userRes = await db.query(`SELECT id, full_name, email FROM users WHERE id = $1`, [account.customer_id]);
  const customer = userRes.rows[0] || { full_name: 'N/A', email: 'N/A' };

  let querySql = `SELECT * FROM transactions WHERE account_id = $1`;
  const queryParams = [accountId];

  if (startDate) {
    queryParams.push(startDate);
    querySql += ` AND created_at >= $${queryParams.length}`;
  }
  if (endDate) {
    queryParams.push(endDate);
    querySql += ` AND created_at <= $${queryParams.length}`;
  }

  querySql += ` ORDER BY created_at ASC`;

  const txRes = await db.query(querySql, queryParams);
  const transactions = txRes.rows;

  if (format === 'pdf') {
    const pdfBuffer = await generateStatementPDF(account, transactions, customer, startDate, endDate);
    return { format: 'pdf', pdfBuffer, fileName: `Statement_${account.account_number}.pdf` };
  }

  return {
    format: 'json',
    account: {
      id: account.id,
      accountNumber: account.account_number,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toString(),
      overdraftLimit: account.overdraft_limit.toString(),
      status: account.status,
    },
    customer: {
      fullName: customer.full_name,
      email: customer.email,
    },
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
    transactionCount: transactions.length,
    transactions,
  };
}

export default { getAccountStatement };
