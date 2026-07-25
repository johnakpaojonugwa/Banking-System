import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { logAudit } from '../utils/auditLogger.js';

export async function reconcileAccount(accountId, adminUserId, reqMeta = {}) {
  // 1. Fetch current account record
  const accRes = await db.query(`SELECT id, account_number, balance FROM accounts WHERE id = $1`, [accountId]);
  if (accRes.rows.length === 0) {
    const err = new Error('Account not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  const account = accRes.rows[0];
  const storedBalance = BigInt(account.balance);

  // 2. Fetch all transactions in history
  const txRes = await db.query(
    `SELECT id, type, amount, related_transaction_id FROM transactions WHERE account_id = $1`,
    [accountId]
  );

  let totalCredits = BigInt(0);
  let totalDebits = BigInt(0);
  const transactions = txRes.rows;

  for (const tx of transactions) {
    const amt = BigInt(tx.amount);
    if (['DEPOSIT', 'TRANSFER_CREDIT', 'LOAN_DISBURSEMENT'].includes(tx.type)) {
      totalCredits += amt;
    } else if (['WITHDRAWAL', 'TRANSFER_DEBIT', 'LOAN_REPAYMENT'].includes(tx.type)) {
      totalDebits += amt;
    } else if (tx.type === 'REVERSAL') {
      let reversedTx = transactions.find((t) => t.id === tx.related_transaction_id);

      if (!reversedTx && tx.related_transaction_id) {
        const relatedRes = await db.query(
          `SELECT type FROM transactions WHERE id = $1`,
          [tx.related_transaction_id]
        );
        if (relatedRes.rows.length > 0) {
          reversedTx = relatedRes.rows[0];
        }
      }

      if (reversedTx) {
        if (['DEPOSIT', 'TRANSFER_CREDIT', 'LOAN_DISBURSEMENT'].includes(reversedTx.type)) {
          totalDebits += amt;
        } else {
          totalCredits += amt;
        }
      } else {
        totalDebits += amt;
      }
    }
  }

  const calculatedBalance = totalCredits - totalDebits;
  const drift = calculatedBalance - storedBalance;
  const isReconciled = drift === BigInt(0);

  await logAudit({
    userId: adminUserId,
    action: 'ACCOUNT_RECONCILIATION_PERFORMED',
    entityType: 'account',
    entityId: accountId,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: {
      accountNumber: account.account_number,
      storedBalance: storedBalance.toString(),
      calculatedBalance: calculatedBalance.toString(),
      drift: drift.toString(),
      isReconciled,
    },
  });

  return {
    accountId: account.id,
    accountNumber: account.account_number,
    storedBalance: storedBalance.toString(),
    calculatedBalance: calculatedBalance.toString(),
    totalCredits: totalCredits.toString(),
    totalDebits: totalDebits.toString(),
    drift: drift.toString(),
    isReconciled,
  };
}

export default { reconcileAccount };
