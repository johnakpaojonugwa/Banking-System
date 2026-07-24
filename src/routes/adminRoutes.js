import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/accounts/:id/reconcile', requireRoles(ROLES.ADMIN), adminController.reconcileAccount);
router.get('/audit-logs', requireRoles(ROLES.ADMIN, ROLES.BANK_MANAGER), adminController.getAuditLogs);
router.patch('/users/:userId/role', requireRoles(ROLES.ADMIN), adminController.updateUserRole);

export default router;
