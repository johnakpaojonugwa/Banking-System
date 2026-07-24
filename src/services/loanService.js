import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { logAudit } from '../utils/auditLogger.js';

export async function applyLoan({ customerId, accountId, principalAmount, termMonths }, reqMeta = {}) {
  // Validate account ownership and status
  const accRes = await db.query(`SELECT id, status FROM accounts WHERE id = $1 AND customer_id = $2`, [accountId, customerId]);
  if (accRes.rows.length === 0) {
    const err = new Error('Account not found or does not belong to customer.');
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  const account = accRes.rows[0];
  if (account.status === 'frozen') {
    const err = new Error('Account is frozen. Loan applications are not permitted.');
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

  // Calculate monthly repayment estimate
  const interestRate = 7.5; // 7.5% fixed annual interest rate
  const monthlyRate = interestRate / 100 / 12;
  const monthlyRepayment = Math.round(
    (principalAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
  );

  const schedule = [];
  for (let i = 1; i <= termMonths; i++) {
    schedule.push({ month: i, amount: monthlyRepayment, status: 'pending' });
  }

  const res = await db.query(
    `INSERT INTO loans (customer_id, account_id, principal_amount, interest_rate, term_months, status, repayment_schedule)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING *`,
    [customerId, accountId, principalAmount, interestRate, termMonths, JSON.stringify(schedule)]
  );

  const loan = res.rows[0];

  await logAudit({
    userId: customerId,
    action: 'LOAN_APPLICATION_SUBMITTED',
    entityType: 'loan',
    entityId: loan.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { principalAmount, termMonths },
  });

  return loan;
}

export async function approveOrRejectLoan(loanId, { status }, actingUserId, reqMeta = {}) {
  const loanRes = await db.query(`SELECT * FROM loans WHERE id = $1`, [loanId]);
  if (loanRes.rows.length === 0) {
    const err = new Error('Loan application not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.LOAN_NOT_FOUND;
    throw err;
  }

  const loan = loanRes.rows[0];
  if (loan.status !== 'pending') {
    const err = new Error(`Loan has already been ${loan.status}.`);
    err.statusCode = 400;
    err.code = ERROR_CODES.LOAN_ALREADY_PROCESSED;
    throw err;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let updatedLoan;

    if (status === 'approved') {
      // Disburse loan funds into linked account
      const accRes = await client.query(`SELECT id, balance, status FROM accounts WHERE id = $1 FOR UPDATE`, [loan.account_id]);
      if (accRes.rows.length === 0) {
        throw new Error('Linked account not found for loan disbursement.');
      }

      const account = accRes.rows[0];
      if (account.status === 'frozen') {
        const err = new Error('Cannot disburse loan into a frozen account.');
        err.statusCode = 403;
        err.code = ERROR_CODES.ACCOUNT_FROZEN;
        throw err;
      }
      if (account.status === 'closed') {
        const err = new Error('Cannot disburse loan into a closed account.');
        err.statusCode = 400;
        err.code = ERROR_CODES.ACCOUNT_CLOSED;
        throw err;
      }

      const updateAccRes = await client.query(
        `UPDATE accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING balance`,
        [loan.principal_amount, loan.account_id]
      );
      const newBal = updateAccRes.rows[0].balance;

      await client.query(
        `INSERT INTO transactions (account_id, type, amount, balance_after, reference, created_by)
         VALUES ($1, 'LOAN_DISBURSEMENT', $2, $3, $4, $5)`,
        [loan.account_id, loan.principal_amount, newBal, `Loan Disbursement #${loan.id}`, actingUserId]
      );

      const updateLoanRes = await client.query(
        `UPDATE loans SET status = 'disbursed', approved_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [actingUserId, loanId]
      );
      updatedLoan = updateLoanRes.rows[0];
    } else {
      const updateLoanRes = await client.query(
        `UPDATE loans SET status = 'rejected', approved_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [actingUserId, loanId]
      );
      updatedLoan = updateLoanRes.rows[0];
    }

    await logAudit(
      {
        userId: actingUserId,
        action: `LOAN_${status.toUpperCase()}`,
        entityType: 'loan',
        entityId: loanId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        details: { status },
      },
      client
    );

    await client.query('COMMIT');
    return updatedLoan;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function repayLoan(loanId, { amount }, userId, reqMeta = {}) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const loanRes = await client.query(`SELECT * FROM loans WHERE id = $1 FOR UPDATE`, [loanId]);
    if (loanRes.rows.length === 0) {
      const err = new Error('Loan not found.');
      err.statusCode = 404;
      err.code = ERROR_CODES.LOAN_NOT_FOUND;
      throw err;
    }

    const loan = loanRes.rows[0];
    if (loan.status !== 'disbursed') {
      const err = new Error('Only disbursed loans can receive repayments.');
      err.statusCode = 400;
      err.code = ERROR_CODES.LOAN_ALREADY_PROCESSED;
      throw err;
    }

    // Lock account and check status
    const accRes = await client.query(
      `SELECT id, customer_id, balance, overdraft_limit, status FROM accounts WHERE id = $1 FOR UPDATE`,
      [loan.account_id]
    );
    const account = accRes.rows[0];

    if (account.status === 'frozen') {
      const err = new Error('Account is frozen. Loan repayments are prohibited.');
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

    const curBal = BigInt(account.balance);
    const overdraft = BigInt(account.overdraft_limit);
    const repayAmt = BigInt(amount);

    if (curBal - repayAmt < -overdraft) {
      const err = new Error('Insufficient account funds for loan repayment.');
      err.statusCode = 400;
      err.code = ERROR_CODES.INSUFFICIENT_FUNDS;
      throw err;
    }

    const accUpdate = await client.query(
      `UPDATE accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING balance`,
      [amount, loan.account_id]
    );
    const newBal = accUpdate.rows[0].balance;

    await client.query(
      `INSERT INTO transactions (account_id, type, amount, balance_after, reference, created_by)
       VALUES ($1, 'LOAN_REPAYMENT', $2, $3, $4, $5)`,
      [loan.account_id, amount, newBal, `Loan Repayment #${loan.id}`, userId]
    );

    // Parse the repayment schedule
    let schedule = typeof loan.repayment_schedule === 'string'
      ? JSON.parse(loan.repayment_schedule)
      : loan.repayment_schedule;
    if (!Array.isArray(schedule)) {
      schedule = [];
    }

    // Calculate total liability (sum of all installment amounts)
    const totalLiability = schedule.reduce((sum, inst) => sum + Number(inst.amount), 0);

    // Cents to allocate from this repayment
    let remainingRepay = Number(amount);

    // Distribute the repayment amount over the schedule installments
    const updatedSchedule = schedule.map((inst) => {
      if (remainingRepay <= 0) return inst;

      const instAmount = Number(inst.amount);
      const currentPaid = Number(inst.amount_paid || 0);
      const instRemaining = instAmount - currentPaid;

      if (instRemaining > 0) {
        if (remainingRepay >= instRemaining) {
          remainingRepay -= instRemaining;
          return {
            ...inst,
            amount_paid: instAmount,
            status: 'paid',
          };
        } else {
          const newPaid = currentPaid + remainingRepay;
          remainingRepay = 0;
          return {
            ...inst,
            amount_paid: newPaid,
            status: 'partially_paid',
          };
        }
      }
      return inst;
    });

    const newAmountRepaid = BigInt(loan.amount_repaid) + repayAmt;
    const isPaidOff = newAmountRepaid >= BigInt(totalLiability);
    const newStatus = isPaidOff ? 'paid_off' : 'disbursed';

    const loanUpdate = await client.query(
      `UPDATE loans SET amount_repaid = $1, status = $2, repayment_schedule = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [newAmountRepaid.toString(), newStatus, JSON.stringify(updatedSchedule), loanId]
    );

    await logAudit(
      {
        userId,
        action: 'LOAN_REPAYMENT',
        entityType: 'loan',
        entityId: loanId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        details: { amount, newStatus, totalRepaid: newAmountRepaid.toString() },
      },
      client
    );

    await client.query('COMMIT');
    return loanUpdate.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCustomerLoans(customerId) {
  const res = await db.query(`SELECT * FROM loans WHERE customer_id = $1 ORDER BY created_at DESC`, [customerId]);
  return res.rows;
}

export async function getLoanById(loanId) {
  const res = await db.query(`SELECT * FROM loans WHERE id = $1`, [loanId]);
  if (res.rows.length === 0) {
    const err = new Error('Loan not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.LOAN_NOT_FOUND;
    throw err;
  }
  return res.rows[0];
}

export default {
  applyLoan,
  approveOrRejectLoan,
  repayLoan,
  getCustomerLoans,
  getLoanById,
};
