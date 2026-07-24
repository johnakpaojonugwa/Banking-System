import db from '../config/db.js';

export async function getSystemReport() {
  // Total accounts count & aggregate balance
  const accStatsRes = await db.query(`
    SELECT 
      COUNT(*) AS total_accounts,
      COALESCE(SUM(balance), 0) AS total_system_balance
    FROM accounts
  `);

  // Frozen / flagged accounts
  const frozenAccsRes = await db.query(`
    SELECT id, customer_id, account_number, type, balance, status, created_at
    FROM accounts WHERE status = 'frozen'
  `);

  // Transaction summary
  const txSummaryRes = await db.query(`
    SELECT type, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
    FROM transactions
    GROUP BY type
  `);

  // System user stats
  const userStatsRes = await db.query(`
    SELECT role, COUNT(*) as count
    FROM users
    GROUP BY role
  `);

  return {
    accountsSummary: {
      totalAccounts: parseInt(accStatsRes.rows[0].total_accounts, 10),
      totalSystemBalance: accStatsRes.rows[0].total_system_balance.toString(),
    },
    frozenAccounts: frozenAccsRes.rows,
    transactionSummary: txSummaryRes.rows,
    userBreakdown: userStatsRes.rows,
  };
}

export async function getAuditLogs(limit = 100) {
  const res = await db.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return res.rows;
}

export default { getSystemReport, getAuditLogs };
