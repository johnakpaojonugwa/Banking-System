import * as reconciliationService from '../services/reconciliationService.js';
import * as reportService from '../services/reportService.js';
import db from '../config/db.js';

export async function reconcileAccount(req, res, next) {
  try {
    const result = await reconciliationService.reconcileAccount(req.params.id, req.user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogs(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = await reportService.getAuditLogs(limit);
    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
}

export async function getReports(req, res, next) {
  try {
    const report = await reportService.getSystemReport();
    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!['Customer', 'Teller', 'Bank_Manager', 'Admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid role specified.',
        },
      });
    }

    const resDb = await db.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role, full_name`,
      [role, req.params.userId]
    );

    if (resDb.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: resDb.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

export default {
  reconcileAccount,
  getAuditLogs,
  getReports,
  updateUserRole,
};
