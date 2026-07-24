import db from '../config/db.js';

/**
 * Logs state-changing action to audit_logs table.
 * Accepts optional client for transaction context.
 */
export async function logAudit({ userId, action, entityType, entityId, ipAddress, userAgent, details = {} }, client = null) {
  const sql = `
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, details)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  const params = [
    userId || null,
    action,
    entityType,
    entityId ? String(entityId) : null,
    ipAddress || '127.0.0.1',
    userAgent || 'Internal API',
    typeof details === 'object' ? JSON.stringify(details) : details,
  ];

  try {
    if (client) {
      await client.query(sql, params);
    } else {
      await db.query(sql, params);
    }
  } catch (err) {
    console.error('Failed to log audit event:', err.message);
  }
}

export default { logAudit };
