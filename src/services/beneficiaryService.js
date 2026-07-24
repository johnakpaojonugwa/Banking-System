import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { logAudit } from '../utils/auditLogger.js';

export async function addBeneficiary({ customerId, nickname, accountNumber, bankName = 'Internal Bank', routingNumber, isExternal = false }, reqMeta = {}) {
  // Check if internal beneficiary account exists
  if (!isExternal) {
    const accCheck = await db.query(
      `SELECT id FROM accounts WHERE account_number = $1`,
      [accountNumber]
    );
    if (accCheck.rows.length === 0) {
      const err = new Error(`Internal account with number ${accountNumber} not found.`);
      err.statusCode = 404;
      err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
      throw err;
    }
  }

  // Check if beneficiary with account_number already exists for customer
  const checkRes = await db.query(
    `SELECT id FROM beneficiaries WHERE customer_id = $1 AND account_number = $2`,
    [customerId, accountNumber]
  );
  if (checkRes.rows.length > 0) {
    const err = new Error('Beneficiary with this account number already exists in your recipient list.');
    err.statusCode = 409;
    err.code = ERROR_CODES.BENEFICIARY_EXISTS;
    throw err;
  }

  const res = await db.query(
    `INSERT INTO beneficiaries (customer_id, nickname, account_number, bank_name, routing_number, is_external)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [customerId, nickname, accountNumber, bankName, routingNumber || null, isExternal]
  );

  const beneficiary = res.rows[0];

  await logAudit({
    userId: customerId,
    action: 'BENEFICIARY_ADDED',
    entityType: 'beneficiary',
    entityId: beneficiary.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { nickname, accountNumber, isExternal },
  });

  return beneficiary;
}

export async function getBeneficiaries(customerId) {
  const res = await db.query(`SELECT * FROM beneficiaries WHERE customer_id = $1 ORDER BY created_at DESC`, [customerId]);
  return res.rows;
}

export default {
  addBeneficiary,
  getBeneficiaries,
};
