import crypto from 'crypto';
import db from '../config/db.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { logAudit } from '../utils/auditLogger.js';

export async function issueCard({ accountId, cardType = 'virtual', dailyLimit = 100000 }, userId, reqMeta = {}) {
  const accRes = await db.query(`SELECT id FROM accounts WHERE id = $1`, [accountId]);
  if (accRes.rows.length === 0) {
    const err = new Error('Account not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.ACCOUNT_NOT_FOUND;
    throw err;
  }

  const random4 = crypto.randomInt(1000, 9999).toString();
  const maskedPan = `4111 **** **** ${random4}`;
  const cardToken = `card_tok_${crypto.randomBytes(16).toString('hex')}`;
  const expiryMonth = Math.floor(Math.random() * 12) + 1;
  const expiryYear = 2028;

  const res = await db.query(
    `INSERT INTO cards (account_id, card_token, masked_pan, card_type, expiry_month, expiry_year, status, daily_limit)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
     RETURNING *`,
    [accountId, cardToken, maskedPan, cardType, expiryMonth, expiryYear, dailyLimit]
  );

  const card = res.rows[0];

  await logAudit({
    userId,
    action: 'CARD_ISSUED',
    entityType: 'card',
    entityId: card.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { cardType, maskedPan },
  });

  return card;
}

export async function updateCardStatus(cardId, status, userId, reqMeta = {}) {
  const res = await db.query(`UPDATE cards SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, cardId]);
  if (res.rows.length === 0) {
    const err = new Error('Card not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.CARD_NOT_FOUND;
    throw err;
  }

  await logAudit({
    userId,
    action: `CARD_${status.toUpperCase()}`,
    entityType: 'card',
    entityId: cardId,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { status },
  });

  return res.rows[0];
}

export async function getCardById(cardId) {
  const res = await db.query(`SELECT c.*, a.customer_id FROM cards c JOIN accounts a ON c.account_id = a.id WHERE c.id = $1`, [cardId]);
  if (res.rows.length === 0) {
    const err = new Error('Card not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.CARD_NOT_FOUND;
    throw err;
  }
  return res.rows[0];
}

export async function getAccountCards(accountId) {
  const res = await db.query(`SELECT * FROM cards WHERE account_id = $1 ORDER BY created_at DESC`, [accountId]);
  return res.rows;
}

export default {
  issueCard,
  updateCardStatus,
  getCardById,
  getAccountCards,
};
